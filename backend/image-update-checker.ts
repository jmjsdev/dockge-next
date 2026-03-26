import { log } from "./log";
import childProcessAsync from "promisify-child-process";
import { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import semver from "semver";

export interface ImageUpdateInfo {
    stackName: string;
    service: string;
    imageName: string;
    currentTag: string;
    remoteTag: string;
    localDigest: string;
    remoteDigest: string;
    localCreated: string;
    updateAvailable: boolean;
    updateKind: "tag" | "digest";
}

interface ParsedImage {
    registry: string;
    image: string;
    tag: string;
}

interface RegistryAuth {
    token: string;
}

const ACCEPT_HEADERS = [
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
].join(", ");

/**
 * Parse a full Docker image reference into registry, image path, and tag.
 */
export function parseImageName(fullName: string): ParsedImage {
    let registry = "docker.io";
    let image = fullName;
    let tag = "latest";

    const lastColon = image.lastIndexOf(":");
    if (lastColon > -1) {
        const afterColon = image.substring(lastColon + 1);
        if (!afterColon.includes("/")) {
            tag = afterColon;
            image = image.substring(0, lastColon);
        }
    }

    const firstSlash = image.indexOf("/");
    if (firstSlash > -1) {
        const prefix = image.substring(0, firstSlash);
        if (prefix.includes(".") || prefix.includes(":")) {
            registry = prefix;
            image = image.substring(firstSlash + 1);
        }
    }

    if (registry === "docker.io" && !image.includes("/")) {
        image = "library/" + image;
    }

    return {
        registry,
        image,
        tag
    };
}

/**
 * Get the registry API base URL for a given registry hostname.
 */
function getRegistryUrl(registry: string): string {
    if (registry === "docker.io") {
        return "https://registry-1.docker.io";
    }
    if (!registry.startsWith("http")) {
        return `https://${registry}`;
    }
    return registry;
}

/**
 * Authenticate with a Docker registry and get a bearer token.
 */
async function authenticate(registry: string, image: string): Promise<RegistryAuth | null> {
    try {
        if (registry === "docker.io") {
            const url = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${image}:pull`;
            const res = await fetch(url);
            if (!res.ok) {
                return null;
            }
            const data = await res.json() as { token: string };
            return { token: data.token };
        }

        if (registry === "ghcr.io") {
            const token = Buffer.from(":", "utf-8").toString("base64");
            return { token };
        }

        const registryUrl = getRegistryUrl(registry);
        const pingRes = await fetch(`${registryUrl}/v2/`, {
            method: "GET",
            redirect: "manual"
        });

        if (pingRes.status === 401) {
            const wwwAuth = pingRes.headers.get("www-authenticate");
            if (wwwAuth) {
                const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
                const serviceMatch = wwwAuth.match(/service="([^"]+)"/);
                if (realmMatch) {
                    let tokenUrl = `${realmMatch[1]}?scope=repository:${image}:pull`;
                    if (serviceMatch) {
                        tokenUrl += `&service=${serviceMatch[1]}`;
                    }
                    const tokenRes = await fetch(tokenUrl);
                    if (tokenRes.ok) {
                        const data = await tokenRes.json() as { token?: string; access_token?: string };
                        return { token: data.token || data.access_token || "" };
                    }
                }
            }
        }

        return { token: "" };
    } catch (e) {
        log.debug("update-checker", `Auth failed for ${registry}/${image}: ${e}`);
        return null;
    }
}

/**
 * Get the local digest of a Docker image.
 */
async function getLocalDigest(fullImageRef: string): Promise<string | null> {
    try {
        const res = await childProcessAsync.spawn("docker", [
            "image", "inspect", fullImageRef,
            "--format", "{{index .RepoDigests 0}}"
        ], { encoding: "utf-8" });

        const output = res.stdout?.toString().trim();
        if (output) {
            const atIndex = output.indexOf("@");
            return atIndex >= 0 ? output.substring(atIndex + 1) : output;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Get local image creation date.
 */
async function getLocalCreated(fullImageRef: string): Promise<string> {
    try {
        const res = await childProcessAsync.spawn("docker", [
            "image", "inspect", fullImageRef,
            "--format", "{{.Created}}"
        ], { encoding: "utf-8" });

        return res.stdout?.toString().trim() || "";
    } catch (e) {
        return "";
    }
}

/**
 * Get the remote digest of a Docker image from its registry.
 */
async function getRemoteDigest(registry: string, image: string, tag: string): Promise<string | null> {
    try {
        const auth = await authenticate(registry, image);
        if (!auth) {
            return null;
        }

        const registryUrl = getRegistryUrl(registry);
        const url = `${registryUrl}/v2/${image}/manifests/${tag}`;

        const headers: Record<string, string> = {
            "Accept": ACCEPT_HEADERS,
        };

        if (auth.token) {
            headers["Authorization"] = `Bearer ${auth.token}`;
        }

        const res = await fetch(url, {
            method: "HEAD",
            headers
        });

        if (!res.ok) {
            log.debug("update-checker", `Registry HEAD failed: ${res.status} for ${url}`);
            return null;
        }

        return res.headers.get("docker-content-digest");
    } catch (e) {
        log.debug("update-checker", `Remote digest failed for ${registry}/${image}:${tag}: ${e}`);
        return null;
    }
}

/**
 * Fetch available tags from registry and find the latest semver-compatible tag.
 */
async function getLatestTag(registry: string, image: string, currentTag: string): Promise<string | null> {
    try {
        const auth = await authenticate(registry, image);
        if (!auth) {
            return null;
        }

        const registryUrl = getRegistryUrl(registry);
        const url = `${registryUrl}/v2/${image}/tags/list`;

        const headers: Record<string, string> = {
            "Accept": "application/json",
        };

        if (auth.token) {
            headers["Authorization"] = `Bearer ${auth.token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
            return null;
        }

        const data = await res.json() as { tags?: string[] };
        if (!data.tags || data.tags.length === 0) {
            return null;
        }

        // If current tag is "latest" or non-semver, we can't determine a version number
        const currentSemver = semver.coerce(currentTag);
        if (!currentSemver) {
            return null;
        }

        // Extract prefix (e.g. "v" from "v1.2.3")
        const prefixMatch = currentTag.match(/^([a-zA-Z-]*)/);
        const prefix = prefixMatch ? prefixMatch[1] : "";

        // Find highest semver tag with same prefix
        let highest = currentSemver;
        let highestTag = currentTag;

        for (const tag of data.tags) {
            if (prefix && !tag.startsWith(prefix)) {
                continue;
            }

            const tagSemver = semver.coerce(tag);
            if (tagSemver && semver.gt(tagSemver, highest)) {
                highest = tagSemver;
                highestTag = tag;
            }
        }

        if (highestTag !== currentTag) {
            return highestTag;
        }
        return null;
    } catch (e) {
        log.debug("update-checker", `Failed to fetch tags for ${registry}/${image}: ${e}`);
        return null;
    }
}

/**
 * Get images for a stack using `docker compose images --format json`.
 */
async function getStackImages(stackPath: string, composeFileName: string): Promise<Array<{ service: string; repository: string; tag: string }>> {
    try {
        const res = await childProcessAsync.spawn("docker", [
            "compose", "-f", composeFileName, "images", "--format", "json"
        ], {
            cwd: stackPath,
            encoding: "utf-8",
        });

        if (!res.stdout) {
            return [];
        }

        const data = JSON.parse(res.stdout.toString());
        if (!Array.isArray(data)) {
            return [];
        }

        return data.map((item: { ContainerName: string; Repository: string; Tag: string; Service?: string }) => ({
            service: item.Service || item.ContainerName,
            repository: item.Repository,
            tag: item.Tag || "latest",
        }));
    } catch (e) {
        return [];
    }
}

export class ImageUpdateChecker {
    private static checking = false;
    static lastChecked: Date | null = null;

    /**
     * Check all stacks for image updates — streaming mode.
     * Updates server.imageUpdates and notifies clients after each stack.
     */
    static async checkAllStacks(server: DockgeServer): Promise<void> {
        if (this.checking) {
            log.debug("update-checker", "Already checking, skipping");
            return;
        }

        this.checking = true;
        log.info("update-checker", "Starting image update check...");

        try {
            const stackList = await Stack.getStackList(server, false);
            let checkedCount = 0;
            const totalCount = stackList.size;

            for (const [ stackName, stack ] of stackList) {
                checkedCount++;

                try {
                    const images = await getStackImages(stack.path, stack.composeFileName);
                    const stackUpdates: ImageUpdateInfo[] = [];

                    for (const img of images) {
                        // Skip images referenced by digest only
                        if (img.repository.startsWith("sha256:") || !img.repository) {
                            continue;
                        }

                        const fullRef = img.tag ? `${img.repository}:${img.tag}` : img.repository;
                        const parsed = parseImageName(fullRef);
                        const isSemverTag = semver.coerce(img.tag) !== null;
                        const isFloatingTag = !isSemverTag;

                        // Mode 1: Pinned semver tag (e.g. v0.32.4, 4.1.0)
                        if (isSemverTag) {
                            const latestTag = await getLatestTag(parsed.registry, parsed.image, img.tag);
                            if (latestTag) {
                                const localCreated = await getLocalCreated(fullRef);
                                stackUpdates.push({
                                    stackName,
                                    service: img.service,
                                    imageName: img.repository,
                                    currentTag: img.tag,
                                    remoteTag: latestTag,
                                    localDigest: "",
                                    remoteDigest: "",
                                    localCreated,
                                    updateAvailable: true,
                                    updateKind: "tag",
                                });
                            }
                            continue;
                        }

                        // Mode 2: Floating tag (latest, release, alpine, etc.)
                        if (isFloatingTag) {
                            const localDigest = await getLocalDigest(fullRef);
                            if (!localDigest) {
                                continue;
                            }

                            const remoteDigest = await getRemoteDigest(parsed.registry, parsed.image, parsed.tag);
                            if (!remoteDigest) {
                                continue;
                            }

                            if (localDigest !== remoteDigest) {
                                const localCreated = await getLocalCreated(fullRef);
                                stackUpdates.push({
                                    stackName,
                                    service: img.service,
                                    imageName: img.repository,
                                    currentTag: img.tag,
                                    remoteTag: img.tag,
                                    localDigest,
                                    remoteDigest,
                                    localCreated,
                                    updateAvailable: true,
                                    updateKind: "digest",
                                });
                            }
                        }
                    }

                    // Update this stack's results immediately
                    if (stackUpdates.length > 0) {
                        server.imageUpdates.set(stackName, stackUpdates);
                    } else {
                        server.imageUpdates.delete(stackName);
                    }

                    // Notify clients after each stack so UI updates progressively
                    await server.sendStackList();

                    log.debug("update-checker", `[${checkedCount}/${totalCount}] ${stackName}: ${stackUpdates.length} update(s)`);

                } catch (e) {
                    log.debug("update-checker", `Error checking stack ${stackName}: ${e}`);
                }
            }

            this.lastChecked = new Date();
            log.info("update-checker", `Update check complete. ${server.imageUpdates.size} stack(s) with updates available.`);

        } catch (e) {
            log.error("update-checker", `Update check failed: ${e}`);
        } finally {
            this.checking = false;
        }
    }

    /**
     * Get updates for a specific stack.
     */
    static getStackUpdates(server: DockgeServer, stackName: string): ImageUpdateInfo[] {
        return server.imageUpdates.get(stackName) || [];
    }

    /**
     * Get total number of stacks with updates.
     */
    static getUpdateCount(server: DockgeServer): number {
        return server.imageUpdates.size;
    }
}

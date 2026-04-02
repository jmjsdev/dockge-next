<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">
                {{ $t("updates") }}
                <span v-if="totalUpdates > 0" class="badge update-count-badge ms-2">{{ totalUpdates }}</span>
            </h1>

            <div class="mb-3 d-flex flex-wrap align-items-center gap-2">
                <button class="btn btn-normal" :disabled="checking || updating" @click="checkUpdates">
                    <font-awesome-icon icon="sync" :spin="checking" class="me-1" />
                    {{ checking ? $t("checking") : $t("checkUpdates") }}
                </button>

                <button v-if="selectedCount > 0" class="btn btn-danger" :disabled="updating" @click="updateSelected">
                    <font-awesome-icon icon="circle-up" class="me-1" />
                    {{ $t("updateSelected") }} ({{ selectedCount }})
                </button>

                <button v-if="enableUpdateAll && totalUpdates > 0 && selectedCount === 0" class="btn btn-danger" :disabled="updating" @click="updateAll">
                    <font-awesome-icon icon="circle-up" class="me-1" />
                    {{ $t("updateAll") }}
                </button>

                <label class="form-check form-switch mb-0 ms-auto">
                    <input v-model="runningOnly" class="form-check-input" type="checkbox" />
                    <span class="form-check-label">{{ $t("runningOnly") }}</span>
                </label>
            </div>

            <!-- Progress bar during batch update -->
            <div v-if="updating" class="shadow-box big-padding mb-3 update-progress">
                <div class="d-flex align-items-center mb-2">
                    <font-awesome-icon icon="sync" spin class="me-2 updating-spinner" />
                    <span>{{ $t("updatingProgress", [progressIndex, progressTotal]) }}</span>
                </div>
                <div class="progress">
                    <div
                        class="progress-bar"
                        role="progressbar"
                        :style="{ width: progressPercent + '%' }"
                        :aria-valuenow="progressIndex"
                        :aria-valuemin="0"
                        :aria-valuemax="progressTotal"
                    ></div>
                </div>
            </div>

            <div v-if="totalUpdates === 0 && !checking" class="shadow-box big-padding text-center no-updates">
                <font-awesome-icon icon="check" class="me-2" />
                {{ $t("noUpdates") }}
            </div>

            <div
                v-for="(stack, key) in stacksWithUpdates"
                :key="key"
                class="shadow-box big-padding mb-3 update-card"
                :class="{
                    'update-card-selected': selected[stack.name],
                    'update-card-done': stackStatus[stack.name] === 'done',
                    'update-card-error': stackStatus[stack.name] === 'error',
                }"
                @click="toggleSelect(stack.name)"
            >
                <div class="d-flex align-items-center mb-2">
                    <input
                        v-model="selected[stack.name]"
                        type="checkbox"
                        class="form-check-input update-checkbox me-3"
                        :disabled="updating"
                        @click.stop
                    />
                    <h4 class="mb-0">
                        <router-link :to="stackUrl(stack)" class="stack-link" @click.stop>{{ stack.name }}</router-link>
                        <font-awesome-icon v-if="currentUpdating === stack.name" icon="sync" spin class="ms-2 updating-spinner" />
                        <font-awesome-icon v-if="stackStatus[stack.name] === 'done'" icon="check" class="ms-2 text-success" />
                        <font-awesome-icon v-if="stackStatus[stack.name] === 'error'" icon="times" class="ms-2 text-danger" />
                    </h4>
                    <span v-if="stack.endpoint && $root.agentCount > 1" class="ms-2 text-muted small">
                        ({{ stack.endpoint || $t("currentEndpoint") }})
                    </span>
                </div>

                <div v-for="update in stack.updates" :key="update.service" class="update-item ms-4 mb-2">
                    <div class="d-flex align-items-center flex-wrap">
                        <span class="service-name me-2">{{ update.service }}</span>
                        <span class="image-ref me-2">{{ update.imageName }}:{{ update.currentTag }}</span>

                        <!-- Semver tag update: show version transition -->
                        <span v-if="update.updateKind === 'tag'" class="version-transition">
                            <span class="current-version">{{ update.currentTag }}</span>
                            <span class="arrow mx-1">→</span>
                            <span class="remote-version">{{ update.remoteTag }}</span>
                        </span>

                        <!-- Digest update: show short digests -->
                        <span v-else-if="update.updateKind === 'digest'" class="version-transition">
                            <span class="current-version" :title="update.localDigest">{{ shortDigest(update.localDigest) }}</span>
                            <span class="arrow mx-1">→</span>
                            <span class="remote-version" :title="update.remoteDigest">{{ shortDigest(update.remoteDigest) }}</span>
                        </span>
                    </div>
                    <div v-if="update.localCreated" class="image-date ms-0 mt-1">
                        {{ $t("lastPulled") }}: {{ formatDate(update.localCreated) }}
                    </div>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    data() {
        return {
            checking: false,
            updating: false,
            selected: {},
            runningOnly: true,
            currentUpdating: "",
            enableUpdateAll: false,
            progressIndex: 0,
            progressTotal: 0,
            stackStatus: {},
        };
    },
    computed: {
        stacksWithUpdates() {
            return Object.values(this.$root.completeStackList).filter(
                stack => stack.updates && stack.updates.length > 0 && (!this.runningOnly || stack.status === 3)
            );
        },

        totalUpdates() {
            return this.stacksWithUpdates.length;
        },

        selectedCount() {
            return Object.values(this.selected).filter(Boolean).length;
        },

        progressPercent() {
            if (this.progressTotal === 0) {
                return 0;
            }
            return Math.round((this.progressIndex / this.progressTotal) * 100);
        },
    },
    mounted() {
        this.$root.getSocket().emit("getSettings", (res) => {
            if (res.data && res.data.enableUpdateAll !== undefined) {
                this.enableUpdateAll = res.data.enableUpdateAll;
            }
        });

        // Listen for backend progress events
        this.$root.getSocket().on("updateStacksProgress", (data) => {
            this.progressTotal = data.total;

            if (data.status === "updating") {
                this.currentUpdating = data.current;
                this.progressIndex = data.index;
            } else if (data.status === "done") {
                this.stackStatus[data.current] = "done";
                this.progressIndex = data.index + 1;
            } else if (data.status === "error") {
                this.stackStatus[data.current] = "error";
                this.progressIndex = data.index + 1;
            } else if (data.status === "complete") {
                this.updating = false;
                this.currentUpdating = "";
            }
        });
    },
    unmounted() {
        this.$root.getSocket().off("updateStacksProgress");
    },
    methods: {
        stackUrl(stack) {
            if (stack.endpoint) {
                return `/compose/${stack.name}/${stack.endpoint}`;
            }
            return `/compose/${stack.name}`;
        },

        shortDigest(digest) {
            if (!digest) {
                return "";
            }
            // "sha256:abc123..." → "abc123..."
            const d = digest.replace("sha256:", "");
            return d.substring(0, 12);
        },

        formatDate(isoDate) {
            if (!isoDate) {
                return "";
            }
            try {
                return new Date(isoDate).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                });
            } catch (e) {
                return isoDate;
            }
        },

        toggleSelect(name) {
            this.selected[name] = !this.selected[name];
        },

        checkUpdates() {
            this.checking = true;
            this.$root.emitAgent("", "checkUpdates", (res) => {
                this.checking = false;
                this.$root.toastRes(res);
            });
        },

        updateAll() {
            const names = this.stacksWithUpdates.map(s => s.name);
            this.startBatchUpdate(names);
        },

        updateSelected() {
            const names = this.stacksWithUpdates
                .filter(s => this.selected[s.name])
                .map(s => s.name);
            if (names.length === 0) {
                return;
            }
            this.startBatchUpdate(names);
            this.selected = {};
        },

        startBatchUpdate(names) {
            this.updating = true;
            this.progressIndex = 0;
            this.progressTotal = names.length;
            this.stackStatus = {};
            this.$root.emitAgent("", "updateStacks", names, (res) => {
                if (!res.ok) {
                    this.updating = false;
                    this.$root.toastRes(res);
                }
            });
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.update-checkbox {
    width: 22px;
    height: 22px;
    min-width: 22px;
    cursor: pointer;
}

.update-count-badge {
    font-size: 14px;
    background-color: #dc3545;
    color: #fff;
    vertical-align: middle;

    .dark & {
        background-color: #f87171;
        color: #1a1a2e;
    }
}

.no-updates {
    color: #6c757d;

    .dark & {
        color: $dark-font-color;
    }
}

.update-progress {
    border-left: 3px solid $primary;

    .progress {
        height: 6px;
        border-radius: 3px;
    }
}

.update-card {
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    border: 2px solid transparent;

    &:hover {
        background-color: rgba(0, 0, 0, 0.02);
    }

    &.update-card-selected {
        border-color: $primary;
        background-color: rgba(116, 194, 255, 0.06);
    }

    &.update-card-done {
        opacity: 0.5;
    }

    &.update-card-error {
        border-color: #dc3545;
    }

    .dark & {
        border-color: $dark-border-color;

        &:hover {
            background-color: rgba(255, 255, 255, 0.03);
        }

        &.update-card-selected {
            border-color: $primary;
            background-color: rgba(116, 194, 255, 0.08);
        }

        &.update-card-error {
            border-color: #f87171;
        }
    }
}

.stack-link {
    text-decoration: none;
    color: inherit;

    &:hover {
        text-decoration: underline;
    }
}

.update-item {
    padding: 6px 0;
    font-size: 14px;
}

.service-name {
    font-weight: 600;
    color: #333;

    .dark & {
        color: $dark-font-color;
    }
}

.image-ref {
    color: #6c757d;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;

    .dark & {
        color: $dark-font-color3;
    }
}

.version-info {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
}

.current-version {
    color: #6c757d;

    .dark & {
        color: $dark-font-color3;
    }
}

.arrow {
    color: #6c757d;
}

.remote-version {
    color: #dc3545;
    font-weight: 600;

    .dark & {
        color: #f87171;
    }
}

.updating-spinner {
    font-size: 14px;
    color: $primary;
}

.version-transition {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
}

.image-date {
    font-size: 12px;
    color: #999;

    .dark & {
        color: $dark-font-color3;
    }
}

.update-digest-badge {
    font-size: 11px;
    font-weight: normal;
    background-color: rgba(220, 53, 69, 0.1);
    color: #dc3545;
    border: 1px solid rgba(220, 53, 69, 0.3);

    .dark & {
        background-color: rgba(248, 113, 113, 0.1);
        color: #f87171;
        border-color: rgba(248, 113, 113, 0.3);
    }
}
</style>

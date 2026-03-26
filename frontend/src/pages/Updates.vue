<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">
                {{ $t("updates") }}
                <span v-if="totalUpdates > 0" class="badge update-count-badge ms-2">{{ totalUpdates }}</span>
            </h1>

            <div class="mb-3 d-flex flex-wrap align-items-center gap-2">
                <button class="btn btn-normal" :disabled="checking" @click="checkUpdates">
                    <font-awesome-icon icon="sync" :spin="checking" class="me-1" />
                    {{ checking ? $t("checking") : $t("checkUpdates") }}
                </button>

                <button v-if="selectedCount > 0" class="btn btn-danger" :disabled="updating" @click="updateSelected">
                    <font-awesome-icon icon="circle-up" class="me-1" />
                    {{ $t("updateSelected") }} ({{ selectedCount }})
                </button>

                <button v-if="totalUpdates > 0 && selectedCount === 0" class="btn btn-danger" :disabled="updating" @click="updateAll">
                    <font-awesome-icon icon="circle-up" class="me-1" />
                    {{ $t("updateAll") }}
                </button>

                <label class="form-check form-switch mb-0 ms-auto">
                    <input v-model="runningOnly" class="form-check-input" type="checkbox" />
                    <span class="form-check-label">{{ $t("runningOnly") }}</span>
                </label>
            </div>

            <div v-if="totalUpdates === 0 && !checking" class="shadow-box big-padding text-center no-updates">
                <font-awesome-icon icon="check" class="me-2" />
                {{ $t("noUpdates") }}
            </div>

            <div
                v-for="(stack, key) in stacksWithUpdates"
                :key="key"
                class="shadow-box big-padding mb-3 update-card"
                :class="{ 'update-card-selected': selected[stack.name] }"
                @click="toggleSelect(stack.name)"
            >
                <div class="d-flex align-items-center mb-2">
                    <input
                        v-model="selected[stack.name]"
                        type="checkbox"
                        class="form-check-input update-checkbox me-3"
                        @click.stop
                    />
                    <h4 class="mb-0">
                        <router-link :to="stackUrl(stack)" class="stack-link" @click.stop>{{ stack.name }}</router-link>
                        <font-awesome-icon v-if="currentUpdating === stack.name" icon="sync" spin class="ms-2 updating-spinner" />
                    </h4>
                    <span v-if="stack.endpoint && $root.agentCount > 1" class="ms-2 text-muted small">
                        ({{ stack.endpoint || $t("currentEndpoint") }})
                    </span>
                </div>

                <div v-for="update in stack.updates" :key="update.service" class="update-item ms-4 mb-1">
                    <span class="service-name me-2">{{ update.service }}</span>
                    <span class="image-ref">{{ update.imageName }}</span>
                    <span v-if="update.remoteTag !== update.currentTag" class="version-info ms-2">
                        <span class="current-version">{{ update.currentTag }}</span>
                        <span class="arrow mx-1">→</span>
                        <span class="remote-version">{{ update.remoteTag }}</span>
                    </span>
                    <span v-else class="badge update-digest-badge ms-2">
                        {{ $t("updateAvailable") }}
                    </span>
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
            updateQueue: [],
            currentUpdating: "",
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
    },
    methods: {
        stackUrl(stack) {
            if (stack.endpoint) {
                return `/compose/${stack.name}/${stack.endpoint}`;
            }
            return `/compose/${stack.name}`;
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

        async updateAll() {
            this.updating = true;
            this.updateQueue = [ ...this.stacksWithUpdates ];
            await this.processQueue();
        },

        async updateSelected() {
            const toUpdate = this.stacksWithUpdates.filter(s => this.selected[s.name]);
            if (toUpdate.length === 0) {
                return;
            }
            this.updating = true;
            this.updateQueue = [ ...toUpdate ];
            await this.processQueue();
            this.selected = {};
        },

        processQueue() {
            return new Promise((resolve) => {
                const next = () => {
                    if (this.updateQueue.length === 0) {
                        this.updating = false;
                        this.currentUpdating = "";
                        resolve();
                        return;
                    }
                    const stack = this.updateQueue.shift();
                    this.currentUpdating = stack.name;
                    this.$root.emitAgent(stack.endpoint || "", "updateStack", stack.name, (res) => {
                        this.$root.toastRes(res);
                        next();
                    });
                };
                next();
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

    .dark & {
        border-color: $dark-border-color;

        &:hover {
            background-color: rgba(255, 255, 255, 0.03);
        }

        &.update-card-selected {
            border-color: $primary;
            background-color: rgba(116, 194, 255, 0.08);
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

<template>
    <div class="container-fluid">
        <div class="row">
            <div v-if="!$root.isMobile" class="col-12 col-md-4 col-xl-3">
                <div>
                    <router-link to="/compose" class="btn btn-primary mb-3"><font-awesome-icon icon="plus" /> {{ $t("compose") }}</router-link>
                </div>
                <StackList :scrollbar="true" />
            </div>

            <div ref="container" class="col-12 mb-3" :class="{ 'col-md-8 col-xl-9': !$root.isMobile }">
                <!-- Add :key to disable vue router re-use the same component -->
                <router-view :key="$route.fullPath" :calculatedHeight="height" />
            </div>
        </div>

        <!-- Mobile StackList Offcanvas -->
        <div v-if="$root.isMobile" class="offcanvas offcanvas-start" :class="{ show: $root.showMobileStackList }" tabindex="-1">
            <div class="offcanvas-header">
                <h5 class="offcanvas-title">{{ $t("Stacks") }}</h5>
                <button type="button" class="btn-close" @click="$root.showMobileStackList = false"></button>
            </div>
            <div class="offcanvas-body">
                <div class="mb-3">
                    <router-link to="/compose" class="btn btn-primary w-100" @click="$root.showMobileStackList = false">
                        <font-awesome-icon icon="plus" /> {{ $t("compose") }}
                    </router-link>
                </div>
                <StackList />
            </div>
        </div>
        <div v-if="$root.isMobile && $root.showMobileStackList" class="offcanvas-backdrop fade show" @click="$root.showMobileStackList = false"></div>
    </div>
</template>

<script>

import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            height: 0
        };
    },
    watch: {
        "$route.fullPath"() {
            this.$root.showMobileStackList = false;
        }
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
    },
};
</script>

<style lang="scss" scoped>
.container-fluid {
    width: 98%;
}

@media (max-width: 768px) {
    .container-fluid {
        width: 100%;
        padding-left: 8px;
        padding-right: 8px;
    }
}

.offcanvas {
    z-index: 1050;
    width: 85%;
    max-width: 350px;
    visibility: visible;
    transform: translateX(-100%);
    transition: transform 0.3s ease-in-out;
    background-color: var(--bs-body-bg);

    &.show {
        transform: translateX(0);
    }
}

.offcanvas-backdrop {
    z-index: 1040;
}

.dark .offcanvas {
    background-color: #0d1117;
    color: #b1b8c0;

    .btn-close {
        filter: invert(1);
    }
}
</style>

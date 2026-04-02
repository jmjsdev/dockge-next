<template>
    <div>
        <div class="mb-4">
            <div class="form-check form-switch">
                <input
                    id="enableUpdateAll"
                    v-model="settings.enableUpdateAll"
                    class="form-check-input"
                    type="checkbox"
                    @change="saveSettings()"
                />
                <label class="form-check-label" for="enableUpdateAll">
                    {{ $t("enableUpdateAll") }}
                </label>
            </div>
            <div class="form-text">
                {{ $t("enableUpdateAllDescription") }}
            </div>
        </div>
    </div>
</template>

<script>
export default {
    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },
    },
};
</script>

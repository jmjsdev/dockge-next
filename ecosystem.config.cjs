module.exports = {
    apps: [
        {
            name: "dockge",
            script: "./backend/index.ts",
            interpreter: "node",
            interpreter_args: "--import tsx/esm",
            cwd: "/home/arnaud/dev/dockge-next",
            env: {
                NODE_ENV: "production",
                DOCKGE_STACKS_DIR: "/home/arnaud/docker",
                DOCKGE_ENABLE_CONSOLE: "true",
            },
            watch: false,
            max_memory_restart: "512M",
            restart_delay: 3000,
            exp_backoff_restart_delay: 1000,
        }
    ]
};

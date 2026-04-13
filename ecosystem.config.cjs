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
                DOCKGE_DATA_DIR: "/home/arnaud/dev/datas/dockge/data",
                DOCKGE_STACKS_DIR: "/home/arnaud/docker",
                DOCKGE_ENABLE_CONSOLE: "true",
            },
        },
    ],
};

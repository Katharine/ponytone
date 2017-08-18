module.exports = {
    entry: './src/js/index.js',
    module: {
        rules: [
            {test: /\.js$/, exclude: /node_modules/, loader: "babel-loader"},
            {test: /\.(mp3|mp4)$/, loader: "file-loader"},
            {test: /\.txt$/, loader: "raw-loader"},
        ],
    },
    devtool: "sourcemap",
    output: {
        filename: "bundle.js",
        path: "/Users/katharine/projects/mlkonline/build/"
    }
};

let path = require("path");
var BundleTracker = require('webpack-bundle-tracker')


module.exports = {
    context: __dirname,
    entry: {
        'party': './assets/js/index',
    },
    module: {
        rules: [
            {test: /\.js$/, exclude: /node_modules/, loader: "babel-loader"},
            {test: /\.(mp3|mp4|png)$/, loader: "file-loader"},
            {test: /\.txt$/, loader: "raw-loader"},
            {test: /\.css$/, use: [
                {loader: "style-loader"},
                {loader: "css-loader"},
            ]}
        ],
    },
    externals: {
        'page-data': '_pageData',
    },
    plugins: [
        new BundleTracker({filename: './webpack-stats.json'}),
    ],
    devtool: "sourcemap",
    output: {
        filename: "[name]-[hash].js",
        path: path.resolve("./assets/bundles/"),
        publicPath: "/static/bundles/"
    }
};

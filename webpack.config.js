let path = require("path");
let BundleTracker = require('webpack-bundle-tracker');
let ExtractTextPlugin = require('extract-text-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');


module.exports = {
    context: __dirname,
    entry: {
        'party': ['./assets/js/party'],
        'index': ['./assets/js/index'],
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {test: /\.ts$/, loader: 'ts-loader'},
            {test: /\.(mp3|mp4|png|woff2?)$/, loader: "file-loader"},
            {test: /\.txt$/, loader: "raw-loader"},
            {test: /\.css$/, use: ExtractTextPlugin.extract({
                fallback: "style-loader",
                use: "css-loader",
            })},
        ],
    },
    externals: {
        'page-data': '_pageData',
    },
    plugins: [
        new BundleTracker({filename: './webpack-stats.json'}),
        new ExtractTextPlugin("[name]-[hash].css"),
        new UglifyJsPlugin({sourceMap: true}),
    ],
    devtool: "sourcemap",
    output: {
        filename: "[name]-[hash].js",
        path: path.resolve("./bundles/"),
        publicPath: "/static/"
    }
};

//@ts-check

'use strict';

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './extension/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};
/**
 * The Publish sidebar runs inside a webview, which is a browser context rather
 * than Node, so it needs a bundle of its own, loaded from dist/ by URI.
 *
 * @type WebpackConfig
 */
const publishViewConfig = {
  target: 'web',
  mode: 'development',
  entry: './extension/publish/view.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'publish_view.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      },
      {
        test: /\.(ttf|woff2?)$/,
        type: 'asset/resource'
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: 'publish_view.css' })
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

/**
 * The .author editor's cell surface, in its own webview and so its own bundle.
 *
 * @type WebpackConfig
 */
const authorViewConfig = {
  ...publishViewConfig,
  entry: './extension/graveyard/author_editor/view.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'author_view.js'
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: 'author_view.css' })
  ],
};

/** @type WebpackConfig */
const authorFileEditorViewConfig = {
  ...publishViewConfig,
  entry: './extension/author_file_editor_webview.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'author_file_editor_view.js'
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: 'author_file_editor_view.css' })
  ],
};

module.exports = [ extensionConfig, publishViewConfig, authorViewConfig, authorFileEditorViewConfig ];
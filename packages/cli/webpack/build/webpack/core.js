const { join } = require('path');
const { existsSync } = require('fs');
const webpack = require('webpack');
const StyleLintPlugin = require('stylelint-webpack-plugin');

const { excludeFile } = require('../../utils/ignore');
const { getPackageInfo } = require('../../utils/getConfig');

const { getProjectEntry, getUmdEntry } = require('./extend/entry');
const useCss = require('./extend/css');
const useMarkdown = require('./extend/markdown');
const useCopy = require('./extend/copy');
const useES = require('./extend/es');
const useSplit = require('./extend/split');

// 获取 loader 包地址
// 本地 npm link 按照相对目录检索
const getLoaderModulesPath = () => {
  const loaderPath = join(__dirname, '../../../node_modules');

  // 故需要判断 cli 是否存在于当前项目下
  const projectPath = process.cwd();
  if (existsSync(loaderPath) && loaderPath.indexOf(projectPath) === -1) {
    return {
      // loader 包解析路径配置
      modules: [loaderPath],
    };
  }

  return null;
};

module.exports = (
  {
    isUmd = false, // 是否 umd 打包
    isDev = true,
    resolvePath = './src',
    target = 'src',
    buildPath = 'dist',
    publicPath = '/',
    copyPath = 'src/public',
    markdown = false, // 是否支持 markdown 解析 html
    splitPackages = [],
    getPlugins = null,
  },
  {
    loaders = [],
    plugins = [],
    devServer = {},
    externals = {}, // 禁用某些包引入bundle
    output = {},
  }
) => {
  // 打包后 chunk 名称
  // contenthash 基于内容变动改变 hash
  const _chunkName = isDev || isUmd ? '' : '[contenthash:5].';
  const _entry = isUmd ? getUmdEntry({ target }) : getProjectEntry({ isDev, target, buildPath, splitPackages });

  // 修复部分组件依赖 NODE_ENV 环境变量问题
  process.env.NODE_ENV = isDev ? 'development' : 'production';

  const baseConfig = {
    // 缓存加速
    cache: {
      type: 'filesystem',
    },

    // 环境变量配置
    // 支持 `webpack --mode=development/production`
    mode: isDev ? 'development' : 'production',

    devtool: isDev ? 'inline-source-map' : false,

    devServer,

    externals,

    resolve: {
      extensions: ['.js', '.json', '.ts', '.tsx', '.scss', '.jsx'],
      alias: {
        '@': join(process.cwd(), resolvePath),
      },
    },

    resolveLoader: {
      // loader 包解析路径配置
      ...getLoaderModulesPath(),
      extensions: ['.js', '.ts', '.tsx', '.jsx', '.vue', '.json'],
    },

    // 模块配置入口
    // string|Array<string>
    // {[entryChunkName: string]: string|Array<string>}
    entry: _entry.entry,

    // 模块输出配置
    output: {
      path: join(process.cwd(), buildPath),
      publicPath: publicPath,
      filename: isUmd ? '[name]/index.js' : `static/scripts/[name].${_chunkName}js`,
      sourceMapFilename: isUmd ? '[name]/index.map' : `static/scripts/[name].${_chunkName}map`,
      chunkFilename: isUmd ? '[name]/[name].js' : `static/scripts/[name].${_chunkName}js`,
      ...output,
    },

    module: {
      rules: [
        {
          test: /\.(png|jpg|jpeg|gif|woff|woff2|ttf|eot|svg|ico)$/,
          loader: 'file-loader',
          options: {
            name: `[name].[ext]${isDev ? '' : '?' + _chunkName}`,
            useRelativePath: false,
            outputPath: 'static/images',
          },
        },
        {
          test: /\.html$/,
          loader: 'html-loader',
          exclude: excludeFile,
        },

        ...loaders,
      ],
    },

    plugins: [..._entry.plugins, ...plugins],
  };

  if (isDev) {
    // tree shaking
    baseConfig.optimization = { ...baseConfig.optimization, usedExports: true };

    baseConfig.plugins.push(
      ...[
        // 进度条
        new webpack.ProgressPlugin(),

        // 开发环境样式校验规则
        new StyleLintPlugin({
          context: target,
          configFile: join(__dirname, '../../config/.stylelintrc'),
          files: ['**/*.{html,css,scss,sass}'],
        }),
      ]
    );
  }

  // 加载 css 预编译相关配置
  useCss({ isDev, isUmd }, baseConfig);

  // 加载 markdown 配置
  useMarkdown(markdown, baseConfig);

  // 加载代码分拆配置
  useSplit({ isUmd, splitPackages }, baseConfig);

  // 加载 复制文件 相关配置
  useCopy(copyPath, baseConfig);

  // 加载 es 相关配置
  useES({}, baseConfig);

  // 加载外部 plugins
  const _plugins = getPlugins ? getPlugins({ isDev, ...getPackageInfo() }) : null;
  _plugins && _plugins.length && baseConfig.plugins.push(..._plugins);

  return baseConfig;
};
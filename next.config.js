
module.exports = {
  webpack(config) {
    config.module.rules.push({
      test: /chrome-aws-lambda/,
      use: 'null-loader', // Ignora los archivos relacionados con chrome-aws-lambda
    });

    return config;
  },
};

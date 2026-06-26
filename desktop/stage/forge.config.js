const { MakerZIP } = require('@electron-forge/maker-zip');
const { MakerDeb } = require('@electron-forge/maker-deb');
const { AutoUnpackNativesPlugin } = require('@electron-forge/plugin-auto-unpack-natives');
const path = require('path');

const config = {
  packagerConfig: {
    name: 'whitelabel-crm',
    executableName: 'whitelabel-crm',
    asar: true,
    extraResource: [
      path.join(__dirname, 'drizzle'),
      path.join(__dirname, 'frontend')
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['linux']),
    new MakerDeb({
      options: {
        name: 'whitelabel-crm',
        bin: 'whitelabel-crm',
        maintainer: 'sfmullins',
        homepage: 'https://github.com/sfmullins/whitelabel-crm',
        categories: ['Office', 'Utility'],
      }
    })
  ],
  plugins: [
    new AutoUnpackNativesPlugin({})
  ]
};

module.exports = config;

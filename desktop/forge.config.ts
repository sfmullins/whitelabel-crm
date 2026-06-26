import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerZIP } from '@electron-forge/maker-zip';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'whitelabel-crm',
    executableName: 'whitelabel-crm',
    asar: true,
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
};

export default config;

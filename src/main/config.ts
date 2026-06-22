import Store from 'electron-store';
import {Rectangle} from 'electron';

type StoreType = {
  window: {
    bounds: Rectangle,
    isMaximized: boolean
  },
  app: {
    launchAtLogin: boolean,
    startHidden: boolean,
    hideMenuBar: boolean,
    disableSpellChecker: boolean,
    accountIndex: number,
    knownAccounts: number[],
    downloadDir: string,
    zoomLevel: number,
    toastPosition: string,
  }
}

const schema: Store.Schema<StoreType> = {
  window: {
    type: 'object',
    properties: {
      bounds: {
        type: 'object',
        properties: {
          x: {
            type: 'number'
          },
          y: {
            type: 'number'
          },
          width: {
            type: 'number'
          },
          height: {
            type: 'number'
          },
        },
        default: {
          x: null,
          y: null,
          width: 800,
          height: 600,
        }
      },
      isMaximized: {
        type: 'boolean',
        default: false
      }
    },
    default: {
      bounds: {}
    }
  },
  app: {
    type: 'object',
    properties: {
      autoLaunchAtLogin: {
        type: 'boolean',
        default: true
      },
      startHidden: {
        type: 'boolean',
        default: false
      },
      hideMenuBar: {
        type: 'boolean',
        default: false
      },
      disableSpellChecker: {
        type: 'boolean',
        default: false
      },
      accountIndex: {
        type: 'number',
        default: 0
      },
      knownAccounts: {
        type: 'array',
        items: {
          type: 'number'
        },
        default: [0]
      },
      downloadDir: {
        type: 'string',
        default: ''
      },
      zoomLevel: {
        type: 'number',
        default: 0
      },
      toastPosition: {
        type: 'string',
        enum: ['top-right', 'top-left', 'bottom-right', 'bottom-left'],
        default: 'top-right'
      },
    },
    default: {}
  }
}

export default new Store<StoreType>({
  schema,
  clearInvalidConfig: true
});

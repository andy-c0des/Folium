/* PlantOS — Code.gs v2.0 */

const PLANTOS_BACKEND_CFG = {
  INVENTORY_SHEET: 'Plant Care Tracking + Inventory',
  SETTINGS_SHEET: 'PlantOS Settings',

  SETTINGS_KEYS: {
    ACTIVE_WEBAPP_URL: 'ACTIVE_WEBAPP_URL',
    REBUILD_CURSOR: 'REBUILD_CURSOR',
    DRIVE_ROOT_ID: 'DRIVE_ROOT_ID',
    DRIVE_PLANTS_ID: 'DRIVE_PLANTS_ID',
    DRIVE_QR_ID: 'DRIVE_QR_ID',
  },

  DRIVE_NAMES: {
    ROOT: 'PlantOS',
    PLANTS: 'Plants',
    QR: 'QR - Plant Pages',
  },

  CANONICAL_PLANT_FOLDER_PREFIX: 'UID_',
  PHOTOS_SUBFOLDER: 'Photos',
  REBUILD_CHUNK: 15,

  QR: {
    SIZE: '320x320',
    API: 'https://api.qrserver.com/v1/create-qr-code/',
  },

  HEADERS: {
    UID: 'Plant UID',
    NICKNAME: 'Nick-name',
    GENUS: 'Genus',
    TAXON: 'Taxon Raw',
    LOCATION: 'Location',
    PLANT_ID: 'Plant ID',

    FOLDER_ID: 'Folder ID',
    FOLDER_URL: 'Folder URL',
    CARE_DOC_ID: 'Care Doc ID',
    CARE_DOC_URL: 'Care Doc URL',
    QR_FILE_ID: 'QR File ID',
    QR_URL: 'QR URL',
    PLANT_PAGE_URL: 'Plant Page URL',
    QR_SCRIPT_URL: 'QR Script URL',
    QR_IMAGE: 'QR Image',

    LAST_WATERED: 'Last Watered',
    WATER_EVERY_DAYS: 'Water Every Days',       // FIX #14: fallback alias below
    WATER_EVERY_DAYS_ALT: 'Water Every (Days)', // FIX #14: actual sheet header
    WATERED: 'Watered',

    LAST_FERTILIZED: 'Last Fertilized',
    FERT_EVERY_DAYS: 'Fertilize Every Days',
    FERTILIZED: 'Fertilized',

    POT_SIZE: 'Pot Size',
    POT_MATERIAL: 'Pot Material',   // FIX #12
    POT_SHAPE: 'Pot Shape',         // FIX #12
    MEDIUM: 'Medium',
    GROWING_METHOD: 'Growing Method',
    SEMIHYDRO_FERT_MODE: 'SH Fert Mode',
    FLUSH_EVERY_N: 'Flush Every N',
    BIRTHDAY: 'Birthday',
    LAST_REPOTTED: 'Last Repot',    // FIX #15
    CULTIVAR: 'Cultivar',           // FIX #15
    HYBRID_NOTE: 'Hybrid Note',     // FIX #15
    INFRA_RANK: 'Infra Rank',       // FIX #15
    INFRA_EPITHET: 'Infra Epithet', // FIX #15

    LATEST_PHOTO_ID: 'Latest Photo ID',
    LATEST_PHOTO_THUMB: 'Latest Photo Thumb',
    LATEST_PHOTO_VIEW: 'Latest Photo View',
    LATEST_PHOTO_UPDATED: 'Latest Photo Updated',
    PURCHASE_PRICE: 'Purchase Price',
  }
};

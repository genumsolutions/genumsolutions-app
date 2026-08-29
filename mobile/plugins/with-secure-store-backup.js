// =====================================================================
// with-secure-store-backup.js
//
// expo-secure-store's own config plugin only points AndroidManifest.xml's
// fullBackupContent / dataExtractionRules at two @xml resources; it does NOT
// author those files. Without them the resource merger fails the build, so
// this plugin writes them during `expo prebuild` (android).
//
// The rules exclude the SecureStore SharedPreferences from Android Auto
// Backup / device transfer: OAuth refresh tokens and naive session pairs are
// sensitive, and cloud-restore of them would undermine the SecureStore keystore.
// =====================================================================
const { withDangerousMod } = require('expo/config-plugins');
const { writeFileSync } = require('fs');
const { join } = require('path');

const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto Backup (Android 8.0 - 11): never upload the SecureStore prefs. -->
<full-backup-content>
  <exclude domain="sharedpref" path="SecureStore.xml" />
</full-backup-content>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- Backup & device transfer (Android 12+): keep token stores on-device. -->
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="sharedpref" path="SecureStore.xml" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="sharedpref" path="SecureStore.xml" />
  </device-transfer>
</data-extraction-rules>
`;

module.exports = function withSecureStoreBackup(config) {
  return withDangerousMod(config, [
    'android',
    async (conf) => {
      const resXmlDir = join(conf.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      const { mkdirSync } = require('fs');
      mkdirSync(resXmlDir, { recursive: true });
      writeFileSync(join(resXmlDir, 'secure_store_backup_rules.xml'), BACKUP_RULES);
      writeFileSync(join(resXmlDir, 'secure_store_data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
      return conf;
    },
  ]);
};
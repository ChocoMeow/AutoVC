export function migrateLegacyGuildSettings(stored: Record<string, unknown>): void {
  if ('syncCategoryPermissions' in stored && !('tempPermissionSync' in stored)) {
    stored.tempPermissionSync = stored.syncCategoryPermissions ? 'category' : 'none';
    delete stored.syncCategoryPermissions;
  }

  if ('defaultOwnerPermissions' in stored) {
    delete stored.defaultOwnerPermissions;
  }
}

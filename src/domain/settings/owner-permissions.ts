import { z } from 'zod';

/** Discord permission flag names grantable to the temp channel owner. */
export const OwnerPermissionKeySchema = z.enum([
  'CreateInstantInvite',
  'ManageChannels',
  'ManageRoles',
  'Stream',
  'UseVAD',
  'PrioritySpeaker',
  'MoveMembers',
  'MuteMembers',
  'DeafenMembers',
  'Connect',
  'Speak',
]);

export type OwnerPermissionKey = z.infer<typeof OwnerPermissionKeySchema>;

export const OWNER_PERMISSION_KEYS = OwnerPermissionKeySchema.options;

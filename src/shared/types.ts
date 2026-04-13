// Shared types used across the backend

export type ModuleId = 'catering' | 'craftservice';

export const MODULE_IDS: readonly ModuleId[] = ['catering', 'craftservice'] as const;

export function isModuleId(value: string): value is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(value);
}

export type UserRole = 'admin' | 'caterer' | 'member';

// Extend Express Request with our auth + moduledata payload
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        name: string;
        email: string;
        role: UserRole;
        adminAccess: boolean;
        department?: string;
        deviceId?: string;
        projectId?: string;
        phone?: string;
        gsmPhone?: string;
      };
      moduleData?: {
        user_id: string;
        project_id: string;
        device_id: string;
        time_stamp: number;
      };
      moduleId?: ModuleId;
    }
  }
}

export {};

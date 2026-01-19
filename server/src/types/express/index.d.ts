import { DBRole, User } from "@/generated/prisma/client";

export interface expressRequestUser {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null | undefined;
}

declare global {
  namespace Express {
    interface Request {
      user:expressRequestUser
    }
  }
}

export {};

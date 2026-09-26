"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

export const signOut = async () => {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
};

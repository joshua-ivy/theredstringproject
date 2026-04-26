export function configuredAdminEmails() {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  const admins = configuredAdminEmails();
  if (!email) {
    return false;
  }

  return admins.length === 0 || admins.includes(email.toLowerCase());
}

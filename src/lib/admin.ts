const defaultAdminEmails = ["jivy26@gmail.com"];

export function configuredAdminEmails() {
  const configured = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured.length > 0 ? configured : defaultAdminEmails;
}

export function isAdminEmail(email?: string | null) {
  const admins = configuredAdminEmails();
  if (!email) {
    return false;
  }

  return admins.includes(email.toLowerCase());
}

/**
 * Layout for unauthenticated routes (login, callback). No app chrome.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid place-items-center px-4">{children}</div>
  );
}

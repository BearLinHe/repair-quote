export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <header className="border-b flex items-center justify-between px-4 py-2">
        <span className="font-semibold">维修报价 | YaoYuan Inc.</span>
      </header>
      {children}
    </div>
  );
}

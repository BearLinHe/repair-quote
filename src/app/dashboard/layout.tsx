export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur flex items-center justify-between px-4 py-3 sm:px-6 min-h-[52px]">
        <span className="font-semibold text-sm sm:text-base truncate">维修报价 | YaoYuan Inc.</span>
      </header>
      {children}
    </div>
  );
}

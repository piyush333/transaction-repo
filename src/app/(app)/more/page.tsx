import { InteractiveCard } from "@/components/ui/card";
import { BarChart3, ScaleIcon, ShieldCheck, Building2, Users, MessageCircle } from "lucide-react";
import Link from "next/link";

export default async function MorePage() {
  const items = [
    { href: "/chat", label: "Chat", icon: MessageCircle },
    { href: "/graphs", label: "Graphs", icon: BarChart3 },
    { href: "/reconciliation", label: "Reconciliation", icon: ScaleIcon },
    { href: "/audit-log", label: "Audit Log", icon: ShieldCheck },
    { href: "/cities", label: "Cities", icon: Building2 },
    { href: "/parties", label: "Parties", icon: Users },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">More</h1>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <InteractiveCard className="flex flex-col items-center gap-2 p-5 text-center">
                <Icon className="h-5 w-5 text-accent" />
                <span className="text-sm font-medium">{item.label}</span>
              </InteractiveCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

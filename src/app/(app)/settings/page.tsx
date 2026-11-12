import { BusinessSettings } from "@/components/BusinessSettings";
import { SettingsView } from "@/components/SettingsView";
import { SmsSettings } from "@/components/SmsSettings";

export const instant = false;

export const metadata = { title: "Settings · Garage desk" };

export default function SettingsPage() {
  return (
    <>
      <BusinessSettings />
      <SmsSettings />
      <SettingsView />
    </>
  );
}

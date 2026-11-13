import { BusinessSettings } from "@/components/BusinessSettings";
import { SavedServices } from "@/components/SavedServices";
import { SettingsView } from "@/components/SettingsView";
import { SmsSettings } from "@/components/SmsSettings";

export const instant = false;

export const metadata = { title: "Settings · Revloop" };

export default function SettingsPage() {
  return (
    <>
      <BusinessSettings />
      <SavedServices />
      <SmsSettings />
      <SettingsView />
    </>
  );
}

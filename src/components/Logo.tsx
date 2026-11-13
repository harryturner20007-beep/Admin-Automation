import Image from "next/image";
import Link from "next/link";

/** The full Revloop logo (navy wordmark), for light surfaces only. Links home. */
export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Link href="/" className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <Image src="/revloop-logo.png" alt="Revloop" width={900} height={179} className={className} priority />
    </Link>
  );
}

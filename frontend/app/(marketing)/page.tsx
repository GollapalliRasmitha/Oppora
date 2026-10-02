import { Navbar } from "@/components/landing/navbar";
import { FinalCTA, Features, Footer, Hero, HowItWorks } from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <div className="ambient min-h-dvh overflow-x-clip">
      <Navbar />
      <main id="main">
        <Hero />
        <Features />
        <HowItWorks />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

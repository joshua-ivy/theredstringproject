"use client";

export function HowItWorksLink() {
  return (
    <button
      className="secondary-link"
      type="button"
      onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" })}
    >
      How it works
    </button>
  );
}

import symbol from "../assets/app-symbol.svg";
export function AppSymbol({ className = "" }: { className?: string }) {
  return <img className={`app-symbol ${className}`} src={symbol} alt="" aria-hidden="true" />;
}

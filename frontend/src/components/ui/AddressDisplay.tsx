import { useENS } from "@/hooks/useENS";
import { ExternalLink } from "lucide-react";

interface AddressDisplayProps {
  /** The Ethereum address to display */
  address: string | `0x${string}` | undefined;
  /** Number of characters to show at start and end when truncating */
  truncateChars?: number;
  /** Whether to show a link to Etherscan */
  showLink?: boolean;
  /** Whether to show loading state */
  showLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Override the block explorer base URL */
  explorerUrl?: string;
  /** Show full address below ENS name */
  showAddressBelow?: boolean;
  /** Use compact display (for inline use) */
  compact?: boolean;
}

/**
 * AddressDisplay - Shows an Ethereum address with ENS name resolution
 *
 * Displays the ENS name if available, otherwise shows the truncated address.
 * Optionally links to Etherscan.
 *
 * @example
 * <AddressDisplay address="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" />
 * // Shows: "vitalik.eth" (if resolved) or "0xd8dA...6045"
 */
export function AddressDisplay({
  address,
  truncateChars = 4,
  showLink = false,
  showLoading = true,
  className = "",
  explorerUrl = "https://sepolia.etherscan.io",
  showAddressBelow = false,
  compact = false,
}: AddressDisplayProps) {
  // Normalize address to 0x format
  const normalizedAddress = address?.startsWith("0x")
    ? (address as `0x${string}`)
    : undefined;

  const { ensName, isLoading } = useENS(normalizedAddress);

  if (!address) {
    return <span className={className}>-</span>;
  }

  // Format the display text
  const truncatedAddress = `${address.slice(0, truncateChars + 2)}...${address.slice(-truncateChars)}`;
  const displayText = ensName || truncatedAddress;
  const hasENS = !!ensName;

  // Show loading indicator if requested
  if (showLoading && isLoading) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin opacity-50" />
        <span className="opacity-50 font-mono">{truncatedAddress}</span>
      </span>
    );
  }

  // Compact mode - just text, no fancy layout
  if (compact) {
    if (showLink) {
      return (
        <a
          href={`${explorerUrl}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-primary-400 hover:text-primary-300 transition-colors ${hasENS ? '' : 'font-mono'} ${className}`}
          title={address}
        >
          {displayText}
        </a>
      );
    }
    return (
      <span className={`${hasENS ? '' : 'font-mono'} ${className}`} title={address}>
        {displayText}
      </span>
    );
  }

  // With Etherscan link
  if (showLink) {
    return (
      <a
        href={`${explorerUrl}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex flex-col hover:opacity-80 transition-opacity ${className}`}
        title={`View ${address} on Etherscan`}
      >
        <span className={`${hasENS ? 'text-primary-400 font-medium' : 'text-primary-400 font-mono'}`}>
          {displayText}
          {!showAddressBelow && <ExternalLink className="w-3 h-3 inline ml-1" />}
        </span>
        {showAddressBelow && hasENS && (
          <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
            {truncatedAddress}
            <ExternalLink className="w-3 h-3" />
          </span>
        )}
      </a>
    );
  }

  // Plain text display with optional address below
  return (
    <span className={`inline-flex flex-col ${className}`} title={address}>
      <span className={`${hasENS ? 'font-medium text-white' : 'font-mono text-gray-300'}`}>
        {displayText}
      </span>
      {showAddressBelow && hasENS && (
        <span className="text-xs text-gray-500 font-mono">
          {truncatedAddress}
        </span>
      )}
    </span>
  );
}

/**
 * Inline address display - for use within text
 * Uses a smaller, inline style
 */
export function AddressInline({
  address,
  truncateChars = 4,
  className = "",
  showLink = false,
  explorerUrl = "https://sepolia.etherscan.io",
}: Pick<AddressDisplayProps, "address" | "truncateChars" | "className" | "showLink" | "explorerUrl">) {
  const normalizedAddress = address?.startsWith("0x")
    ? (address as `0x${string}`)
    : undefined;

  const { ensName } = useENS(normalizedAddress);

  if (!address) return null;

  const truncatedAddress = `${address.slice(0, truncateChars + 2)}...${address.slice(-truncateChars)}`;
  const displayText = ensName || truncatedAddress;
  const hasENS = !!ensName;

  if (showLink) {
    return (
      <a
        href={`${explorerUrl}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-primary-400 hover:text-primary-300 text-xs ${hasENS ? '' : 'font-mono'} ${className}`}
        title={address}
      >
        {displayText}
      </a>
    );
  }

  return (
    <span className={`text-xs ${hasENS ? '' : 'font-mono'} ${className}`} title={address}>
      {displayText}
    </span>
  );
}

/**
 * Wallet display for navbar - shows ENS with address below, clickable to Etherscan
 */
export function WalletDisplay({
  address,
  truncateChars = 4,
  className = "",
}: Pick<AddressDisplayProps, "address" | "truncateChars" | "className">) {
  const normalizedAddress = address?.startsWith("0x")
    ? (address as `0x${string}`)
    : undefined;

  const { ensName, isLoading } = useENS(normalizedAddress);

  if (!address) return null;

  const truncatedAddress = `${address.slice(0, truncateChars + 2)}...${address.slice(-truncateChars)}`;
  const hasENS = !!ensName;

  // Loading state
  if (isLoading) {
    return (
      <a
        href={`https://sepolia.etherscan.io/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex flex-col items-end hover:opacity-80 transition-opacity ${className}`}
        title={`View ${address} on Etherscan`}
      >
        <span className="text-sm font-mono text-gray-300 flex items-center gap-1">
          <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
          {truncatedAddress}
        </span>
      </a>
    );
  }

  return (
    <a
      href={`https://sepolia.etherscan.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex flex-col items-end hover:opacity-80 transition-opacity ${className}`}
      title={`View ${address} on Etherscan`}
    >
      {hasENS ? (
        <>
          <span className="text-sm font-medium text-primary-400">{ensName}</span>
          <span className="text-xs text-gray-500 font-mono">{truncatedAddress}</span>
        </>
      ) : (
        <span className="text-sm font-mono text-gray-300">{truncatedAddress}</span>
      )}
    </a>
  );
}

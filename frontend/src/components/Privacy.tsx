export default function Privacy(){
  return (
    <div className="landing" style={{ textAlign:'left' }}>
      <h2>Privacy (Beta)</h2>
      <p>We collect minimal data to operate the service during beta.</p>
      <ul>
        <li>Wallet address, match metadata (wins/losses, scores), logs for debugging.</li>
        <li>Third‑party RPC/indexers may process your requests (e.g., Helius/Solana RPC).</li>
        <li>We may retain logs temporarily for abuse prevention and service quality.</li>
        <li>Contact support for data inquiries or deletion requests where applicable.</li>
      </ul>
      <p>Full Privacy Policy will follow. See Disclaimer for additional notices.</p>
    </div>
  )
}



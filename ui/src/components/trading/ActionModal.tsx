import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader } from 'lucide-react';
import type { Restaurant } from './DashboardShell';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface InventoryType {
  inventoryTypeID: number;
  inventoryTypeName: string;
}

interface ActionModalProps {
  type: 'fill-bid' | 'create-listing';
  restaurant: Restaurant;
  onClose: () => void;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function ActionModal({ type, restaurant, onClose }: ActionModalProps) {
  const isFillBid = type === 'fill-bid';

  // ── Shared state ──
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; isDryRun: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Create Listing form state ──
  const [inventoryTypes, setInventoryTypes] = useState<InventoryType[]>([]);
  const [inventoryTypeID, setInventoryTypeID] = useState<number>(2);
  const [date, setDate] = useState(todayPlusDays(14));
  const [time, setTime] = useState('19:00');
  const [priceDollars, setPriceDollars] = useState((restaurant.avgPriceCents / 100).toFixed(2));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // ── Fill Bid form state ──
  const [bidPrice, setBidPrice] = useState((restaurant.avgPriceCents * 0.85 / 100).toFixed(2));

  // Fetch inventory types for the restaurant
  useEffect(() => {
    if (isFillBid) return;
    fetch(`${API_BASE}/location/${restaurant.alias}/inventory-types`)
      .then(r => r.json())
      .then(data => {
        const types: InventoryType[] = data?.Payload ?? [];
        if (types.length > 0) {
          setInventoryTypes(types);
          setInventoryTypeID(types[0].inventoryTypeID);
        }
      })
      .catch(() => { /* use default */ });
  }, [restaurant.alias, isFillBid]);

  const handleCreateListing = async (isDryRun: boolean) => {
    if (!date || !time || !firstName || !lastName || !email || !phone) {
      setError('Please fill in all required fields.');
      return;
    }

    const priceCents = Math.round(parseFloat(priceDollars) * 100);
    if (isNaN(priceCents) || priceCents <= 0) {
      setError('Please enter a valid price.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/location/${restaurant.alias}/listing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryTypeID,
          priceAmountInSmallestUnit: priceCents,
          currencyCode: 'USD',
          dateTime: `${date} ${time}:00`,
          firstName,
          lastName,
          emailAddress: email,
          phoneNumber: phone,
          locationCategoryFieldIDValueList: [],
          execute: !isDryRun,
        }),
      });

      const data = await res.json();

      if (data.RequestStatus === 'Failed' || res.status >= 400) {
        throw new Error(data.ResponseMessage ?? 'Listing creation failed');
      }

      setResult({
        success: true,
        message: isDryRun
          ? `Dry run passed — ${restaurant.name} on ${date} at $${priceDollars} is valid.`
          : `Listing created for ${restaurant.name} on ${date} at $${priceDollars}!`,
        isDryRun,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFillBid = async () => {
    setError(null);
    setSubmitting(true);
    // Fill Bid requires a specific bid ID — from the Dashboard this is a pre-check only
    setResult({
      success: false,
      message: 'To fill a specific bid, go to the Portfolio page and select a bid from the active bids list.',
      isDryRun: true,
    });
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isFillBid ? 'Fill Bid' : 'Create Listing'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* ── Result state ── */}
        {result && (
          <div className="modal-body">
            <div className="modal-success">
              <div className="modal-success-icon">
                {result.success ? <CheckCircle2 size={28} color="var(--color-green)" /> : <AlertTriangle size={28} />}
              </div>
              <p className="modal-success-title">{result.isDryRun ? 'Dry Run' : 'Success'}</p>
              <p className="modal-success-desc">{result.message}</p>
              <button className="modal-btn primary" onClick={onClose}>Done</button>
            </div>
          </div>
        )}

        {/* ── Fill Bid form (simple) ── */}
        {!result && isFillBid && (
          <div className="modal-body">
            <div className="modal-restaurant">
              <div className="modal-restaurant-logo" style={{ background: restaurant.color }}>
                {restaurant.name.charAt(0)}
              </div>
              <div>
                <div className="modal-restaurant-name">{restaurant.name}</div>
                <div className="modal-restaurant-meta">{restaurant.city}</div>
              </div>
            </div>
            <div className="modal-field">
              <label>Current Avg Price</label>
              <span className="modal-field-value">{formatPrice(restaurant.avgPriceCents)}</span>
            </div>
            <div className="modal-field">
              <label>Bid Price</label>
              <div className="modal-price-input">
                <span className="modal-price-prefix">$</span>
                <input type="number" value={bidPrice} onChange={e => setBidPrice(e.target.value)} step="0.01" min="0" />
              </div>
            </div>
            {error && <div className="modal-error"><AlertTriangle size={14} />{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
              <button className="modal-btn danger" onClick={handleFillBid} disabled={submitting}>
                {submitting ? <Loader size={14} className="spinning" /> : 'Fill Bid'}
              </button>
            </div>
          </div>
        )}

        {/* ── Create Listing form ── */}
        {!result && !isFillBid && (
          <div className="modal-body">
            <div className="modal-restaurant">
              <div className="modal-restaurant-logo" style={{ background: restaurant.color }}>
                {restaurant.name.charAt(0)}
              </div>
              <div>
                <div className="modal-restaurant-name">{restaurant.name}</div>
                <div className="modal-restaurant-meta">{restaurant.city}</div>
              </div>
            </div>

            <div className="modal-form-grid">
              {/* Reservation slot */}
              <div className="modal-field modal-field--full">
                <label>Reservation Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="modal-input" min={todayPlusDays(1)} />
              </div>
              <div className="modal-field">
                <label>Time</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="modal-input" />
              </div>
              <div className="modal-field">
                <label>Type</label>
                {inventoryTypes.length > 0 ? (
                  <select value={inventoryTypeID} onChange={e => setInventoryTypeID(Number(e.target.value))} className="modal-input">
                    {inventoryTypes.map(t => (
                      <option key={t.inventoryTypeID} value={t.inventoryTypeID}>{t.inventoryTypeName}</option>
                    ))}
                  </select>
                ) : (
                  <select value={inventoryTypeID} onChange={e => setInventoryTypeID(Number(e.target.value))} className="modal-input">
                    <option value={2}>Reservation</option>
                    <option value={1}>Reservation Transfer</option>
                  </select>
                )}
              </div>

              {/* Price */}
              <div className="modal-field modal-field--full">
                <label>Listing Price</label>
                <div className="modal-price-input">
                  <span className="modal-price-prefix">$</span>
                  <input type="number" value={priceDollars} onChange={e => setPriceDollars(e.target.value)} step="0.01" min="0" />
                </div>
              </div>

              {/* Guest info */}
              <div className="modal-field">
                <label>First Name <span className="modal-required">*</span></label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="modal-input" placeholder="Alex" />
              </div>
              <div className="modal-field">
                <label>Last Name <span className="modal-required">*</span></label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="modal-input" placeholder="Johnson" />
              </div>
              <div className="modal-field modal-field--full">
                <label>Email <span className="modal-required">*</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="modal-input" placeholder="alex@example.com" />
              </div>
              <div className="modal-field modal-field--full">
                <label>Phone <span className="modal-required">*</span></label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="modal-input" placeholder="+1 555-123-4567" />
              </div>
            </div>

            {error && <div className="modal-error"><AlertTriangle size={14} /><span>{error}</span></div>}

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
              <button className="modal-btn secondary" onClick={() => handleCreateListing(true)} disabled={submitting}>
                {submitting ? <Loader size={14} className="spinning" /> : 'Dry Run'}
              </button>
              <button className="modal-btn primary" onClick={() => handleCreateListing(false)} disabled={submitting}>
                {submitting ? <Loader size={14} className="spinning" /> : 'Create Listing'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

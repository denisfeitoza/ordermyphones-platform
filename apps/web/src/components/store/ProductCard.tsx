import { Link, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { totalAvailable, type CatalogItem } from '@/data/catalog';
import { useCart, useTier, useWishlist } from '@/store';
import { Button } from '@/components/ui/Button';
import { Badge, badgeTone } from '@/components/ui/Badge';
import { Stars } from '@/components/ui/Stars';
import { TierPrice } from './TierPrice';
import { StockBadge } from './StockBadge';
import { cn } from '@/lib/utils';

export function ProductCard({ item }: { item: CatalogItem }) {
  const { tier } = useTier();
  const { add, setOpen } = useCart();
  const { has, toggleItem } = useWishlist();
  const navigate = useNavigate();
  const soldOut = totalAvailable(item) === 0;
  const saved = has(item.id);

  const storageLabel =
    item.storage.length > 1
      ? `${item.storage[0]}–${item.storage[item.storage.length - 1]}GB`
      : `${item.storage[0]}GB`;

  function buyNow() {
    add(item.id);
    setOpen(false);
    navigate('/checkout');
  }

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 ease-spring hover:-translate-y-1 hover:border-border/70 hover:shadow-card-hover">
      <button
        type="button"
        onClick={() => toggleItem(item.id)}
        aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
        aria-pressed={saved}
        className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full border border-border bg-background/80 backdrop-blur transition-colors hover:bg-background"
      >
        <Heart className={cn('h-[18px] w-[18px] transition-colors', saved ? 'fill-brand text-brand' : 'text-muted-foreground')} strokeWidth={2} />
      </button>
      <Link to={`/p/${item.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-muted/30">
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {item.badges.map((b) => (
            <Badge key={b} tone={badgeTone(b)}>
              {b}
            </Badge>
          ))}
          <Badge tone="glass">{item.brand}</Badge>
        </div>
        <img
          src={item.image}
          alt={item.model}
          loading="lazy"
          className="h-full w-full object-contain p-5 transition-transform duration-500 ease-spring group-hover:scale-[1.06]"
        />
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={`/p/${item.slug}`}>
              <h3 className="truncate font-medium tracking-tight hover:text-brand">{item.model}</h3>
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {storageLabel} · {item.condition === 'cpo' ? 'Certified Pre-Owned' : 'New'}
            </p>
          </div>
          <div className="flex shrink-0 -space-x-1 pt-1">
            {item.colors.slice(0, 4).map((c) => (
              <span
                key={c.name}
                title={c.name}
                className="h-3.5 w-3.5 rounded-full border border-border ring-1 ring-background"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Stars rating={item.rating} reviews={item.reviews} />
          <StockBadge item={item} />
        </div>

        <div className="mt-auto space-y-3 pt-1">
          <TierPrice item={item} tier={tier} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled={soldOut} onClick={() => add(item.id)}>
              Add to cart
            </Button>
            <Button variant="primary" size="sm" disabled={soldOut} onClick={buyNow}>
              {soldOut ? 'Sold out' : 'Buy now'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Navigate } from 'react-router-dom';

// The cart lives in the slide-over drawer; a direct /cart hit goes to checkout,
// which shows the full editable order summary.
export default function CartPage() {
  return <Navigate to="/checkout" replace />;
}

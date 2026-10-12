import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProductInfo from './component/productInfo';
import RelatedProduct from './component/relatedProduct';
import { productoService, ProductoError } from '../../service/producto.service';
import type { ProductType } from '../../type/productType';

type DetailState =
  | { id: number; status: 'ok'; product: ProductType }
  | { id: number; status: 'error'; message: string };

export default function ProductDetail() {
  const { id } = useParams();
  const productId = Number(id);
  const validId = Number.isSafeInteger(productId) && productId > 0;
  const [state, setState] = useState<DetailState | null>(null);

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    productoService.getById(productId)
      .then((product) => {
        if (!cancelled) setState({ id: productId, status: 'ok', product });
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof ProductoError ? e.message : 'Ocurrió un error inesperado.';
        setState({ id: productId, status: 'error', message });
      });
    // Si el id cambia (por ejemplo al entrar a un producto relacionado), se ignora la respuesta vieja.
    return () => { cancelled = true; };
  }, [productId, validId]);

  if (!validId) return <p>El producto solicitado no es válido.</p>;
  if (!state || state.id !== productId) return <p>Cargando...</p>;
  if (state.status === 'error') return <p>{state.message}</p>;

  return (
    <div>
      <ProductInfo product={state.product} />
      <RelatedProduct currentProduct={state.product} />
    </div>
  );
}
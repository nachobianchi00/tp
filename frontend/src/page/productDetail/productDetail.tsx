import { useParams } from 'react-router-dom';
import ProductInfo from './component/productInfo';
import RelatedProduct from './component/relatedProduct';
import { useCatalog } from '../../context/catalogContext/useCatalog';

export default function ProductDetail() {
  const { id } = useParams();
  const { products, loading } = useCatalog();

  if (loading) return <p>Cargando…</p>;

  const product = products.find((p) => p.id === Number(id));
  if (!product) return <p>No encontramos ese producto.</p>;

  return (
    <div>
      <ProductInfo product={product} />
      <RelatedProduct currentProduct={product} />
    </div>
  );
}
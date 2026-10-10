import { useParams } from 'react-router-dom';
import ProductInfo from './component/productInfo';
import RelatedProduct from './component/relatedProduct';
import { products } from '../../mock/products';

export default function ProductDetail() {
  const { id } = useParams();
  const product = products.find((p) => p.id === Number(id)) ?? products[0];

  return (
    <div>
      <ProductInfo product={product} />
      <RelatedProduct currentProduct={product} />
    </div>
  );
}
// src/component/header/component/navegator.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { productoService } from '../../../service/producto.service';
import type { ProductType } from '../../../type/productType';
import styles from '../header.module.css';

export default function Navegator() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ProductType[]>([]);

  useEffect(() => {
    let cancelled = false;
    productoService.getAll()
      .then((list) => { if (!cancelled) setProducts(list); })
      .catch(() => { /* Sin productos cargados, el buscador simplemente no sugiere nada. */ });
    return () => { cancelled = true; };
  }, []);

  const suggestions = search.trim() === ''
    ? []
    : products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      );

  function handleSelect(productId: number) {
    navigate(`/producto/${productId}`);
    setSearch('');
  }

  return (
    <div className={styles.buscadorWrapper}>
      <svg
        className={styles.iconLupa}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>

      <input
        type="text"
        placeholder="Buscar productos..."
        className={styles.buscador}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {suggestions.length > 0 && (
        <ul className={styles.listaSugerencias}>
          {suggestions.map((p) => (
            <li key={p.id} onClick={() => handleSelect(p.id)}>
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
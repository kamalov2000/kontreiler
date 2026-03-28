-- Таблица пользователей
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('client', 'carrier')),
  name TEXT,
  phone TEXT,
  city TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица заявок
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id),
  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  container_type TEXT NOT NULL CHECK (container_type IN ('20ft', '40ft', '40HC', '45ft')),
  ready_date DATE NOT NULL,
  price INTEGER,
  is_negotiable BOOLEAN DEFAULT FALSE,
  is_urgent BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'matched', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица откликов
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  carrier_id UUID NOT NULL REFERENCES users(id),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, carrier_id)
);

-- RLS политики
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Пользователи видят свой профиль
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE USING (auth.uid() = id);

-- Все авторизованные видят всех пользователей (нужно для контактов)
CREATE POLICY "Authenticated users can view all users"
  ON users FOR SELECT USING (auth.role() = 'authenticated');

-- Активные заявки видят все авторизованные
CREATE POLICY "Active orders visible to all"
  ON orders FOR SELECT USING (
    auth.role() = 'authenticated'
  );

-- Клиент создаёт свои заявки
CREATE POLICY "Clients can create orders"
  ON orders FOR INSERT WITH CHECK (auth.uid() = client_id);

-- Клиент обновляет свои заявки
CREATE POLICY "Clients can update own orders"
  ON orders FOR UPDATE USING (auth.uid() = client_id);

-- Отклики: перевозчик видит свои + клиент на свои заявки
CREATE POLICY "Carriers see own responses"
  ON responses FOR SELECT USING (auth.uid() = carrier_id);

CREATE POLICY "Clients see responses to their orders"
  ON responses FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_id AND orders.client_id = auth.uid())
  );

-- Перевозчик создаёт отклик
CREATE POLICY "Carriers can create responses"
  ON responses FOR INSERT WITH CHECK (auth.uid() = carrier_id);

-- Включаем Realtime для таблицы orders
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

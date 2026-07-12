export type UserRole = 'client' | 'carrier'
export type ContainerType = '20ft' | '40ft' | '40HC' | '45ft' | '20REF' | '40REF' | '20TC' | '40TC' | '20DC2'
export type TruckContainerType = ContainerType | 'any'
export type VatType = 'none' | 'vat5' | 'vat15' | 'vat20' | 'vat0'
export type OrderFormat = 'regular' | 'urgent' | 'reduction' | 'auction'
export type OrderStatus = 'active' | 'matched' | 'in_transit' | 'delivered' | 'closed' | 'cancelled' | 'expired'

export interface User {
  id: string
  role: UserRole
  name: string | null
  phone: string | null
  city: string | null
  is_verified: boolean
  is_phone_verified: boolean
  last_seen_at: string | null
  created_at: string
  company_name: string | null
  inn: string | null
  license_number: string | null
  onboarding_completed: boolean
}

// Чувствительные реквизиты компании — приватная таблица user_private,
// доступна только владельцу (RLS) и серверу (service_role). Не в общей users.
export interface UserPrivate {
  id: string
  phone: string | null
  kpp: string | null
  ogrn: string | null
  legal_address: string | null
  actual_address: string | null
  bank_name: string | null
  bank_account: string | null
  bank_corr_account: string | null
  bank_bik: string | null
  signatory_name: string | null
  signatory_position: string | null
  signatory_basis: string | null
  default_obligations: string | null
}

export interface CompanyMember {
  id: string
  owner_id: string
  name: string
  position: string | null
  phone: string | null
  created_at: string
}

export interface Bid {
  id: string
  order_id: string
  carrier_id: string
  amount: number
  created_at: string
  carrier?: User
}

export interface Order {
  id: string
  client_id: string
  accepted_carrier_id?: string | null
  format: OrderFormat
  auction_start_price: number | null
  auction_end_time: string | null
  auction_winner_id: string | null
  auction_min_price: number | null
  auction_max_price: number | null
  auction_step: number | null
  auction_auto_winner: boolean
  auction_auto_extend: boolean
  arrival_time: string | null
  from_city: string
  via_city: string | null
  to_city: string
  from_city_address: string | null
  via_city_address: string | null
  to_city_address: string | null
  container_type: ContainerType
  ready_date: string
  expires_at: string | null
  price: number | null
  is_negotiable: boolean
  is_urgent: boolean
  weight_gross: number | null
  weight_net: number | null
  weight_gross_2: number | null
  weight_net_2: number | null
  downtime_rate: number | null
  ready_time: string | null
  was_expired: boolean
  vat_type: VatType
  requires_genset: boolean
  notes: string | null
  hide_phone: boolean
  agreed_price: number | null
  order_number: string | null
  status: OrderStatus
  created_at: string
  // трекинг
  tracking_enabled: boolean
  tracking_status: string | null
  tracking_updated_at: string | null
  // контрагенты
  counterparties_only: boolean
  // joined
  client?: User
  responses?: Response[]
  response_count?: number
}

export interface Response {
  id: string
  order_id: string
  carrier_id: string
  message: string | null
  created_at: string
  // joined
  carrier?: User
  order?: Order
}

export type TruckStatus = 'active' | 'busy' | 'done' | 'closed'
export type NotificationType =
  | 'new_response' | 'new_message'
  | 'new_truck_response' | 'new_truck_message'
  | 'response_accepted'
  | 'order_delivered' | 'trip_done'
  | 'order_cancelled'
  | 'order_changed'
  | 'review_request'
  | 'auction_won' | 'auction_ended'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  link: string
  is_read: boolean
  created_at: string
  // Задача 8: текст-описание (детали корректировки заявки), может отсутствовать
  message?: string | null
}

// Данные водителя и ТС по заявке — для транспортной накладной (разделы 6,7,8,10,12).
// Заполняет принятый перевозчик; читают обе стороны сделки (таблица order_driver_info).
export interface OrderDriverInfo {
  id: string
  order_id: string
  driver_name: string | null
  vehicle_brand: string | null
  vehicle_plate: string | null
  trailer_plate: string | null
  created_at: string
}

export interface OrderStop {
  id: string
  order_id: string
  address: string
  comment: string | null
  sort_order: number
  created_at: string
}

export interface Truck {
  id: string
  carrier_id: string
  from_city: string
  to_city: string
  container_type: TruckContainerType
  available_date: string
  price: number | null
  is_negotiable: boolean
  notes: string | null
  truck_number: string | null
  status: TruckStatus
  created_at: string
  // новые параметры
  payload: number | null           // грузоподъёмность, тонн
  trailer_type: string | null      // тип прицепа
  long_distance: boolean           // готовность к дальним рейсам
  // joined
  carrier?: User
}

export interface TruckResponse {
  id: string
  truck_id: string
  client_id: string
  message: string | null
  created_at: string
  // joined
  client?: User
  truck?: Truck
}

export interface TruckMessage {
  id: string
  truck_id: string
  client_id: string
  carrier_id: string
  sender_id: string
  text: string
  created_at: string
  sender?: User
}

export interface Review {
  id: string
  order_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer?: User
  reviewee?: User
}

export interface Counterparty {
  id: string
  owner_id: string
  counterparty_id: string
  note: string | null
  created_at: string
  counterparty?: User
}

export interface SavedRoute {
  id: string
  carrier_id: string
  from_city: string
  to_city: string
  container_type: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User
        Insert: Omit<User, 'created_at' | 'is_verified' | 'is_phone_verified' | 'last_seen_at'> & {
          is_verified?: boolean
          is_phone_verified?: boolean
          last_seen_at?: string
        }
        Update: Partial<Omit<User, 'id' | 'role' | 'created_at'>>
      }
      orders: {
        Row: Order
        Insert: Omit<Order, 'id' | 'created_at' | 'status'> & { status?: OrderStatus }
        Update: Partial<Omit<Order, 'id' | 'client_id' | 'created_at'>>
      }
      responses: {
        Row: Response
        Insert: Omit<Response, 'id' | 'created_at'>
        Update: Partial<Omit<Response, 'id' | 'created_at'>>
      }
    }
  }
}

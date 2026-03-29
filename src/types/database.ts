export type UserRole = 'client' | 'carrier'
export type ContainerType = '20ft' | '40ft' | '40HC' | '45ft' | '20REF' | '40REF' | '20TC' | '40TC'
export type VatType = 'none' | 'vat20' | 'vat0'
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
}

export interface Order {
  id: string
  client_id: string
  accepted_carrier_id?: string | null
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
  vat_type: VatType
  requires_genset: boolean
  notes: string | null
  agreed_price: number | null
  order_number: string | null
  status: OrderStatus
  created_at: string
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
  | 'review_request'

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  link: string
  is_read: boolean
  created_at: string
}

export interface Truck {
  id: string
  carrier_id: string
  from_city: string
  to_city: string
  container_type: ContainerType
  available_date: string
  price: number | null
  is_negotiable: boolean
  notes: string | null
  truck_number: string | null
  status: TruckStatus
  created_at: string
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

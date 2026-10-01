export type DataLocalizationRegion =
  | 'AU'
  | 'BH'
  | 'BR'
  | 'CA'
  | 'CH'
  | 'DE'
  | 'GB'
  | 'ID'
  | 'IN'
  | 'JP'
  | 'KR'
  | 'SG'
  | 'ZA'
  | 'AE'

export interface RegisterPhoneNumberInput {
  pin: string
  data_localization_region?: DataLocalizationRegion
}

export type VerificationCodeMethod = 'SMS' | 'VOICE'

export interface RequestVerificationCodeInput {
  code_method: VerificationCodeMethod
  language: string
}

export interface VerifyCodeInput {
  code: string
}

export interface SetTwoStepVerificationPinInput {
  pin: string
}

export interface SuccessResponse {
  success: true
}

export interface VerifyCodeResponse extends SuccessResponse {
  id?: string
}

export type PhoneNumberQualityRating = 'GREEN' | 'NA' | 'RED' | 'YELLOW'
export type PhoneNumberCodeVerificationStatus = 'UNVERIFIED' | 'VERIFIED'
export type PhoneNumberNameStatus =
  | 'APPROVED'
  | 'AVAILABLE_WITHOUT_REVIEW'
  | 'DECLINED'
  | 'EXPIRED'
  | 'NONE'
  | 'PENDING_REVIEW'

export interface PhoneNumberInfo {
  id: string
  display_phone_number?: string
  verified_name?: string
  quality_rating?: PhoneNumberQualityRating
  code_verification_status?: PhoneNumberCodeVerificationStatus
  name_status?: PhoneNumberNameStatus
  status?: string
  [key: string]: unknown
}

export interface GetPhoneNumberOptions {
  fields?: string[]
  signal?: AbortSignal
}

export interface RegistrationRequestOptions {
  signal?: AbortSignal
}

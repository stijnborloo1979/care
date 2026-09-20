import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export interface LocationSetting {
  enabled: boolean
  consent_at: string | null
  home_lat: number | null
  home_lng: number | null
  radius_m: number
}

export function useLocationSetting(householdId: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['location-setting', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<LocationSetting> => {
      const { data, error } = await supabase
        .from('location_setting')
        .select('enabled, consent_at, home_lat, home_lng, radius_m')
        .eq('household_id', householdId)
        .maybeSingle()
      if (error) throw error
      return (
        (data as LocationSetting | null) ?? {
          enabled: false,
          consent_at: null,
          home_lat: null,
          home_lng: null,
          radius_m: 500,
        }
      )
    },
  })

  const zet = useMutation({
    mutationFn: async (v: { aan: boolean; lat?: number; lng?: number; radius?: number }) => {
      const { error } = await supabase.rpc('set_location_consent', {
        hh: householdId,
        aan: v.aan,
        home_lat: v.lat ?? null,
        home_lng: v.lng ?? null,
        radius: v.radius ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-setting', householdId] })
      queryClient.invalidateQueries({ queryKey: ['last-location', householdId] })
    },
  })

  return { setting: query.data, isLoading: query.isLoading, zet }
}

export function useLastLocation(householdId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['last-location', householdId],
    enabled: !!householdId && enabled,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('last_location', { hh: householdId })
      if (error) throw error
      const rij = Array.isArray(data) ? data[0] : data
      return (rij ?? null) as {
        at: string
        lat: number
        lng: number
        inside_zone: boolean | null
      } | null
    },
  })
}

/**
 * Meldt de positie zolang de toestemming aan staat. Vijf minuten is ruim
 * genoeg om een wandeling op te volgen en houdt de telefoon koel; vaker
 * meten levert niets op en voelt wel als volgen.
 *
 * record_location() weigert stil wanneer de toestemming intussen is
 * ingetrokken, dus een vergeten timer kan nooit data blijven schrijven.
 */
export function useLocationReporter(householdId: string, enabled: boolean) {
  const bezig = useRef(false)

  useEffect(() => {
    if (!householdId || !enabled || !navigator.geolocation) return

    function meld() {
      if (bezig.current) return
      bezig.current = true
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await supabase.rpc('record_location', {
              hh: householdId,
              p_lat: pos.coords.latitude,
              p_lng: pos.coords.longitude,
              p_accuracy: Math.round(pos.coords.accuracy),
            })
          } finally {
            bezig.current = false
          }
        },
        () => {
          bezig.current = false
        },
        { enableHighAccuracy: false, maximumAge: 120_000, timeout: 15_000 },
      )
    }

    meld()
    const id = window.setInterval(meld, 5 * 60_000)
    return () => window.clearInterval(id)
  }, [householdId, enabled])
}

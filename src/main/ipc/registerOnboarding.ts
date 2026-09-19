import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { handle, type Services } from './registry'
import type { SessionStore } from '../services/sessionStore'
import { AppError, ErrorCode } from '@shared/lib/errors'
import {
  onboardingFinishSchema,
  type OnboardingService
} from '../services/onboardingService'

/**
 * Onboarding endpoints are reachable before any user exists. They are only
 * usable while onboarding is incomplete — the service refuses every mutation
 * once the organization has been configured (fail-closed).
 */
export const registerOnboardingIpc = (services: Services, sessionStore: SessionStore): void => {
  const onboarding = services.onboarding as OnboardingService

  handle(
    IpcChannel.OnboardingState,
    {
      handler: () => onboarding.getState()
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OnboardingCompleteStep,
    {
      schema: z.object({
        stepId: z.string().min(1).max(40),
        stepIndex: z.number().int().min(0).max(50),
        data: z.record(z.string(), z.unknown())
      }),
      handler: (_ctx, input: { stepId: string; stepIndex: number; data: Record<string, unknown> }) => {
        if (onboarding.isComplete()) {
          throw new AppError(ErrorCode.Forbidden, 'Onboarding is already complete.')
        }
        return onboarding.saveStep(input.stepId, input.stepIndex, input.data)
      }
    },
    services,
    () => sessionStore.get()
  )

  handle(
    IpcChannel.OnboardingFinish,
    {
      // The service re-validates authoritatively; schema here is a shape sanity gate.
      schema: z.object({}).passthrough(),
      handler: (_ctx, input: Record<string, unknown>) => {
        if (onboarding.isComplete()) {
          throw new AppError(ErrorCode.Forbidden, 'Onboarding is already complete.')
        }
        const parsed = onboardingFinishSchema.safeParse(input)
        if (!parsed.success) {
          throw new AppError(ErrorCode.Validation, 'Onboarding data is incomplete or invalid.', {
            issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
          })
        }
        onboarding.finish(parsed.data)
        return { restartRequired: true }
      }
    },
    services,
    () => sessionStore.get()
  )
}

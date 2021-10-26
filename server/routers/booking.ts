import { Prisma } from "@prisma/client";
import { z } from "zod";

import { createRouter } from "../createRouter";

export const bookingRouter = createRouter()
  .query("userEventTypes", {
    input: z.object({
      username: z.string().min(1),
    }),
    async resolve({ input, ctx }) {
      const { prisma } = ctx;
      const { username } = input;

      const user = await prisma.user.findUnique({
        where: {
          username: username.toLowerCase(),
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          bio: true,
          avatar: true,
          theme: true,
          plan: true,
        },
      });

      if (!user) {
        return null;
      }

      const eventTypesWithHidden = await prisma.eventType.findMany({
        where: {
          AND: [
            {
              teamId: null,
            },
            {
              OR: [
                {
                  userId: user.id,
                },
                {
                  users: {
                    some: {
                      id: user.id,
                    },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          slug: true,
          title: true,
          length: true,
          description: true,
          hidden: true,
          schedulingType: true,
          price: true,
          currency: true,
        },
        take: user.plan === "FREE" ? 1 : undefined,
      });

      const eventTypes = eventTypesWithHidden.filter((evt) => !evt.hidden);
      return {
        user,
        eventTypes,
      };
    },
  })
  .query("eventTypeByUsername", {
    input: z.object({
      username: z.string().min(1),
      slug: z.string(),
      date: z.string().nullish(),
    }),
    async resolve({ input, ctx }) {
      const { prisma } = ctx;
      const { username, slug } = input;
      const eventTypeSelect = Prisma.validator<Prisma.EventTypeSelect>()({
        id: true,
        title: true,
        availability: true,
        description: true,
        length: true,
        price: true,
        currency: true,
        periodType: true,
        periodStartDate: true,
        periodEndDate: true,
        periodDays: true,
        periodCountCalendarDays: true,
        schedulingType: true,
        minimumBookingNotice: true,
        users: {
          select: {
            avatar: true,
            name: true,
            username: true,
            hideBranding: true,
            plan: true,
          },
        },
      });

      const user = await prisma.user.findUnique({
        where: {
          username: username.toLowerCase(),
        },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          bio: true,
          avatar: true,
          startTime: true,
          endTime: true,
          timeZone: true,
          weekStart: true,
          availability: true,
          hideBranding: true,
          theme: true,
          plan: true,
          eventTypes: {
            where: {
              AND: [
                {
                  slug,
                },
                {
                  teamId: null,
                },
              ],
            },
            select: eventTypeSelect,
          },
        },
      });

      if (!user) {
        return null;
      }

      if (user.eventTypes.length !== 1) {
        const eventTypeBackwardsCompat = await prisma.eventType.findFirst({
          where: {
            AND: [
              {
                userId: user.id,
              },
              {
                slug,
              },
            ],
          },
          select: eventTypeSelect,
        });
        if (!eventTypeBackwardsCompat) {
          return null;
        }
        eventTypeBackwardsCompat.users.push({
          avatar: user.avatar,
          name: user.name,
          username: user.username,
          hideBranding: user.hideBranding,
          plan: user.plan,
        });
        user.eventTypes.push(eventTypeBackwardsCompat);
      }

      const [eventType] = user.eventTypes;

      // check this is the first event

      // TEMPORARILY disabled because of a bug during event create - during which users were able
      // to create event types >n1.
      /*if (user.plan === "FREE") {
    const firstEventType = await prisma.eventType.findFirst({
      where: {
        OR: [
          {
            userId: user.id,
          },
          {
            users: {
              some: {
                id: user.id,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });
    if (firstEventType?.id !== eventType.id) {
      return {
        notFound: true,
      } as const;
    }
  }*/
      const getWorkingHours = (availability: typeof user.availability | typeof eventType.availability) =>
        availability && availability.length ? availability : null;

      const workingHours =
        getWorkingHours(eventType.availability) ||
        getWorkingHours(user.availability) ||
        [
          {
            days: [0, 1, 2, 3, 4, 5, 6],
            startTime: user.startTime,
            endTime: user.endTime,
          },
        ].filter((availability): boolean => typeof availability["days"] !== "undefined");

      workingHours.sort((a, b) => a.startTime - b.startTime);

      const eventTypeObject = Object.assign({}, eventType, {
        periodStartDate: eventType.periodStartDate?.toString() ?? null,
        periodEndDate: eventType.periodEndDate?.toString() ?? null,
      });

      return {
        profile: {
          name: user.name,
          image: user.avatar,
          slug: user.username,
          theme: user.theme,
          weekStart: user.weekStart,
        },
        eventType: eventTypeObject,
        workingHours,
      };
    },
  });

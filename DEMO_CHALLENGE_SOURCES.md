# Stock demo challenge sources

These are licensed stock examples assigned to fictional demo profiles, not claims
that those profiles created the original works. They are not offered for sale.
Photo locations are intentionally hidden rather than guessed from the profile city.

| Challenge               | Demo profile   | Original source                                                                                                                                              | License                                                                 |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Cinema without a budget | Mika Tanaka    | [Elegant couple in a kiosk, Edgar Fernandez](https://mixkit.co/free-stock-video/elegant-couple-in-a-kiosk-2400/)                                             | [Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree) |
| Cinema without a budget | Lucas Meyer    | [Man opening his laptop and putting on headphones at a cafe, Mixkit](https://mixkit.co/free-stock-video/a-young-man-sitting-at-the-terrace-of-a-cozy-99905/) | [Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree) |
| One color               | Elena Moreau   | [Green leaf close up, Free Nature Stock](https://isorepublic.com/photo/green-leaf-close-up/)                                                                 | [CC0](https://isorepublic.com/license/)                                 |
| One color               | Anna Kovalenko | [Orange and yellow painted wall, Digital Buggu](https://www.pexels.com/photo/orange-and-yellow-painted-wall-319382/)                                         | [Pexels License](https://www.pexels.com/license/)                       |
| Shadow: the protagonist | Yusuf Amrani   | [Person in front of a brick wall, Maxim Tolchinskiy](https://unsplash.com/photos/a-person-standing-in-front-of-a-brick-wall-ioNy61kgDXM)                     | [Unsplash License](https://unsplash.com/license)                        |
| Shadow: the protagonist | Joao Silva     | [Woman walking beside wall, Jon Tyson](https://unsplash.com/photos/woman-walking-beside-wall--mjdqpCJQsE)                                                    | [Unsplash License](https://unsplash.com/license)                        |

The dedicated seeder downloads and processes these sources into the application's
public object storage. Only stock demo entries are preapproved; real users'
submissions continue to require moderation. Re-running does not repopulate
withdrawn entries or overwrite administrative changes.

`pnpm db:refresh:demo-challenge-video` replaces only Lucas's original kiosk clip
with the distinct cafe scene (Mixkit 99905, 11 seconds). It preserves the work and
entry IDs, participants and moderation. Modified or unavailable works are not
overwritten. New versioned object keys prevent stale video/poster caches; old
objects are retained. Repeating the command is a no-op after replacement.

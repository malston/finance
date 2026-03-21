package valyu

import "time"

// IsMarketHours returns true if the given time falls within US equity market
// trading hours: 9:30 AM - 4:00 PM ET, Monday through Friday.
func IsMarketHours(t time.Time) bool {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		return false
	}

	et := t.In(loc)

	// Weekends
	if et.Weekday() == time.Saturday || et.Weekday() == time.Sunday {
		return false
	}

	hour, min, _ := et.Clock()
	minuteOfDay := hour*60 + min

	// Market open: 9:30 AM = 570 minutes
	// Market close: 4:00 PM = 960 minutes
	return minuteOfDay >= 570 && minuteOfDay < 960
}

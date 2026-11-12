package sessions

import (
	"sort"
	"time"
)

// Totals sums credits by period, agent, model and folder.
type Totals struct {
	Today    float64      `json:"today"`
	Week     float64      `json:"week"`  // last 7 days, including today
	Month    float64      `json:"month"` // last 30 days, including today
	Daily    []Day        `json:"daily"` // 30 entries, oldest first
	ByAgent  []AgentTotal `json:"byAgent"`
	ByModel  []Group      `json:"byModel"`
	ByFolder []Group      `json:"byFolder"`
	Top      []TopChat    `json:"top"`
	Covered  int          `json:"covered"` // chats whose usage Kiro saved in a readable form
	Total    int          `json:"total"`
}

// Day is one day's credits, in local time.
type Day struct {
	Date    string  `json:"date"` // YYYY-MM-DD
	Credits float64 `json:"credits"`
}

// Group is a credit total for one model or folder over the last 30 days.
type Group struct {
	Name    string  `json:"name"`
	Credits float64 `json:"credits"`
	Chats   int     `json:"chats"`
	Rate    float64 `json:"rateMultiplier,omitempty"`
}

// AgentTotal is one agent's last 30 days.
type AgentTotal struct {
	Name       string   `json:"name"`
	Credits    float64  `json:"credits"`
	Chats      int      `json:"chats"`
	Turns      int      `json:"turns"`
	AvgContext float64  `json:"avgContextPct"`
	FullChats  int      `json:"fullChats"` // chats that went above 80% of their context
	Models     []string `json:"models"`
	MainModel  string   `json:"mainModel,omitempty"`
	MainRate   float64  `json:"mainRate,omitempty"`
	RunningNow int      `json:"runningNow"`
	LastUsedAt string   `json:"lastUsedAt,omitempty"`
}

// TopChat is one of the chats that used the most credits in the last 30 days.
type TopChat struct {
	ID      string  `json:"id"`
	Title   string  `json:"title"`
	Folder  string  `json:"folder"`
	Agent   string  `json:"agent,omitempty"`
	Credits float64 `json:"credits"`
}

// FullContext is the context use above which a chat counts as nearly full.
const FullContext = 80.0

func emptyTotals(now time.Time) Totals {
	t := Totals{ByAgent: []AgentTotal{}, ByModel: []Group{}, ByFolder: []Group{}, Top: []TopChat{}}
	start := midnight(now).AddDate(0, 0, -29)
	for i := 0; i < 30; i++ {
		t.Daily = append(t.Daily, Day{Date: start.AddDate(0, 0, i).Format("2006-01-02")})
	}
	return t
}

func midnight(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func summarize(list []Session, usages map[string]*Usage, now time.Time) Totals {
	t := emptyTotals(now)
	t.Total = len(list)
	today := midnight(now)
	monthStart := today.AddDate(0, 0, -29)
	weekStart := today.AddDate(0, 0, -6)
	dayIndex := map[string]int{}
	for i, d := range t.Daily {
		dayIndex[d.Date] = i
	}
	agents := map[string]*AgentTotal{}
	agentModels := map[string]map[string]float64{}
	ctxSum := map[string]float64{}
	ctxN := map[string]int{}
	models := map[string]*Group{}
	folders := map[string]*Group{}
	chat := map[string]float64{} // credits per chat in 30 days, subagents folded into parents
	byID := map[string]Session{}
	for _, s := range list {
		byID[s.ID] = s
	}
	for _, s := range list {
		u := usages[s.ID]
		if u == nil {
			continue
		}
		t.Covered++
		owner := s.ID
		if p, ok := byID[s.ParentID]; ok && usages[p.ID] != nil {
			owner = p.ID
		}
		agentName := s.Agent
		if agentName == "" {
			agentName = defaultAgent
		}
		a := agents[agentName]
		if a == nil {
			a = &AgentTotal{Name: agentName, Models: []string{}}
			agents[agentName] = a
			agentModels[agentName] = map[string]float64{}
		}
		if s.Running {
			a.RunningNow++
		}
		if s.UpdatedAt > a.LastUsedAt {
			a.LastUsedAt = s.UpdatedAt
		}
		usedInMonth := false
		for _, turn := range u.Turns {
			end := turn.End.In(now.Location())
			if end.Before(monthStart) {
				continue
			}
			usedInMonth = true
			if i, ok := dayIndex[end.Format("2006-01-02")]; ok {
				t.Daily[i].Credits += turn.Credits
			}
			t.Month += turn.Credits
			if !end.Before(weekStart) {
				t.Week += turn.Credits
			}
			if !end.Before(today) {
				t.Today += turn.Credits
			}
			a.Credits += turn.Credits
			a.Turns++
			model := turn.Model
			if model == "" {
				model = u.Model
			}
			agentModels[agentName][model] += turn.Credits
			m := models[model]
			if m == nil {
				m = &Group{Name: model}
				models[model] = m
			}
			m.Credits += turn.Credits
			if model == u.Model && u.RateMultiplier > 0 {
				m.Rate = u.RateMultiplier
			}
			f := folders[s.Folder]
			if f == nil {
				f = &Group{Name: s.Folder}
				folders[s.Folder] = f
			}
			f.Credits += turn.Credits
			chat[owner] += turn.Credits
		}
		if !usedInMonth {
			continue
		}
		a.Chats++
		if u.HasContext {
			ctxSum[agentName] += u.ContextPct
			ctxN[agentName]++
		}
		if u.MaxContextPct >= FullContext {
			a.FullChats++
		}
		if m := models[modelOf(u)]; m != nil {
			m.Chats++
		}
		if f := folders[s.Folder]; f != nil {
			f.Chats++
		}
	}
	for name, a := range agents {
		if a.Chats == 0 && a.RunningNow == 0 {
			continue
		}
		if ctxN[name] > 0 {
			a.AvgContext = ctxSum[name] / float64(ctxN[name])
		}
		best := -1.0
		for m, c := range agentModels[name] {
			a.Models = append(a.Models, m)
			if c > best {
				best, a.MainModel = c, m
			}
		}
		sort.Strings(a.Models)
		if g := models[a.MainModel]; g != nil {
			a.MainRate = g.Rate
		}
		t.ByAgent = append(t.ByAgent, *a)
	}
	sort.Slice(t.ByAgent, func(i, j int) bool { return t.ByAgent[i].Credits > t.ByAgent[j].Credits })
	t.ByModel = sortedGroups(models)
	t.ByFolder = sortedGroups(folders)
	for id, c := range chat {
		s := byID[id]
		t.Top = append(t.Top, TopChat{ID: id, Title: s.Title, Folder: s.Folder, Agent: s.Agent, Credits: c})
	}
	sort.Slice(t.Top, func(i, j int) bool { return t.Top[i].Credits > t.Top[j].Credits })
	if len(t.Top) > 10 {
		t.Top = t.Top[:10]
	}
	return t
}

func modelOf(u *Usage) string {
	if len(u.Turns) > 0 && u.Turns[len(u.Turns)-1].Model != "" {
		return u.Turns[len(u.Turns)-1].Model
	}
	return u.Model
}

func sortedGroups(m map[string]*Group) []Group {
	out := make([]Group, 0, len(m))
	for _, g := range m {
		if g.Credits > 0 || g.Chats > 0 {
			out = append(out, *g)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Credits > out[j].Credits })
	return out
}

package handler

import (
	"reflect"
	"testing"
)

func TestParseGitHubTestRepo(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    githubTestRepo
		wantErr bool
	}{
		{name: "valid repo", raw: "octo-org/demo-repo", want: githubTestRepo{Owner: "octo-org", Name: "demo-repo"}},
		{name: "trims whitespace", raw: "  owner/repo  ", want: githubTestRepo{Owner: "owner", Name: "repo"}},
		{name: "missing slash", raw: "owner", wantErr: true},
		{name: "empty owner", raw: "/repo", wantErr: true},
		{name: "empty repo", raw: "owner/", wantErr: true},
		{name: "too many segments", raw: "a/b/c", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseGitHubTestRepo(tt.raw)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseGitHubTestRepo(%q) error = %v, wantErr %v", tt.raw, err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if got != tt.want {
				t.Fatalf("parseGitHubTestRepo(%q) = %+v, want %+v", tt.raw, got, tt.want)
			}
		})
	}
}

func TestParseGitHubIssueNumbers(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    []int
		wantErr bool
	}{
		{name: "single issue", raw: "7", want: []int{7}},
		{name: "multiple issues", raw: "2,5,8", want: []int{2, 5, 8}},
		{name: "trims spaces", raw: " 2, 5 , 8 ", want: []int{2, 5, 8}},
		{name: "empty string", raw: "", wantErr: true},
		{name: "non numeric", raw: "2,abc", wantErr: true},
		{name: "zero issue", raw: "0", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseGitHubIssueNumbers(tt.raw)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseGitHubIssueNumbers(%q) error = %v, wantErr %v", tt.raw, err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("parseGitHubIssueNumbers(%q) = %v, want %v", tt.raw, got, tt.want)
			}
		})
	}
}

func TestParseGitHubPRNumber(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    int
		wantErr bool
	}{
		{name: "valid pr", raw: "17", want: 17},
		{name: "trims whitespace", raw: " 17 ", want: 17},
		{name: "empty", raw: "", wantErr: true},
		{name: "non numeric", raw: "abc", wantErr: true},
		{name: "zero", raw: "0", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseGitHubPRNumber(tt.raw)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseGitHubPRNumber(%q) error = %v, wantErr %v", tt.raw, err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if got != tt.want {
				t.Fatalf("parseGitHubPRNumber(%q) = %d, want %d", tt.raw, got, tt.want)
			}
		})
	}
}
